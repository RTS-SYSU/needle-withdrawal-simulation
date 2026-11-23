'use strict';

const $=id=>document.getElementById(id), V=a=>new THREE.Vector3(...a);
const point=p=>V(sub(p,RCM)).multiplyScalar(.001); // 平移原点并换算为 mm，保留机器人 XYZ 轴向。
const fmt=(x,n=3)=>(Math.abs(x)<.5*10**-n?0:x).toFixed(n);
const defaultCenter = centerOnCap(0, 0);
let center = defaultCenter, current;
const DEFAULT_VIEW = 'real';
let view = DEFAULT_VIEW, dirty = true;
const host=$('scene'),scene=new THREE.Scene();
scene.background=new THREE.Color('#e8efed');
const camera=new THREE.PerspectiveCamera(38,1,.001,5000);
camera.up.set(0,0,-1); // 机器人原生 +Z 向下。
let renderer;
try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}
catch(error){$('error').hidden=false;$('error').textContent='无法创建 WebGL 三维视图，请使用支持 WebGL 的浏览器。'+error.message;throw error;}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight('#ffffff','#8b9d8f',2.3));
const sun=new THREE.DirectionalLight('#ffffff',2.5);sun.position.set(-20,-40,-60);scene.add(sun);

// 本地相机控制：以屏幕方向平移、围绕目标旋转，不改变模型坐标。
const target=new THREE.Vector3(0,0,5);
const cameraViews = {
  real: {azimuth: .55, elevation: -.38, roll: Math.PI / 4},
  iso: {azimuth: -.86, elevation: -.38, roll: 0},
  x: {azimuth: 0, elevation: 0, roll: 0},
  y: {azimuth: -Math.PI / 2, elevation: 0, roll: 0},
  z: {azimuth: -Math.PI / 2, elevation: -Math.PI / 2 + .001, roll: 0},
};
let {azimuth, elevation, roll} = cameraViews[DEFAULT_VIEW];
let distance = 67, drag = null;
function cameraUpdate(){
  camera.position.copy(target).add(new THREE.Vector3(
    distance*Math.cos(elevation)*Math.cos(azimuth),
    distance*Math.cos(elevation)*Math.sin(azimuth),distance*Math.sin(elevation)));
  camera.lookAt(target);
  camera.rotateZ(roll);
  camera.updateMatrixWorld();
  dirty = true;
}
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('pointerdown',e=>{
  renderer.domElement.setPointerCapture(e.pointerId);
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,pan:e.button===2||e.shiftKey};
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
  if(drag.pan){
    const unit=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(1,host.clientHeight);
    target.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),-dx*unit);
    target.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),dy*unit);
  }else{azimuth-=dx*.007;elevation=Math.max(-Math.PI/2+.001,Math.min(Math.PI/2-.001,elevation+dy*.007));view='free';markView();}
  cameraUpdate();
});
for(const name of ['pointerup','pointercancel','lostpointercapture']) renderer.domElement.addEventListener(name,()=>{drag=null;});
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(.15,Math.min(2400,distance*Math.exp(e.deltaY*.001)));cameraUpdate();},{passive:false});

function line(color,dashed=false,opacity=1){
  const material=dashed?new THREE.LineDashedMaterial({color,dashSize:.5,gapSize:.32,transparent:true,opacity}):new THREE.LineBasicMaterial({color,transparent:true,opacity});
  const obj=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),material);
  obj.frustumCulled=false;scene.add(obj);return obj;
}
function setLine(obj,points){obj.geometry.dispose();obj.geometry=new THREE.BufferGeometry().setFromPoints(points);if(obj.material.isLineDashedMaterial)obj.computeLineDistances();}
function marker(radius,color){const obj=new THREE.Mesh(new THREE.SphereGeometry(radius,24,16),new THREE.MeshBasicMaterial({color}));scene.add(obj);return obj;}
const globe=new THREE.Group();scene.add(globe);
const eye=new THREE.Mesh(new THREE.SphereGeometry(12,64,40),new THREE.MeshPhongMaterial({
  color:'#76a995',transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false,shininess:75}));
globe.add(eye);
// 稀疏经纬线让透明球体的体积和朝向保持可读。
const gridMaterial=new THREE.LineBasicMaterial({color:'#79a894',transparent:true,opacity:.26});
for(let j=1;j<12;j++){
  const phi=j*Math.PI/12,pts=[];
  for(let i=0;i<=120;i++){const a=i/120*2*Math.PI;pts.push(new THREE.Vector3(12*Math.sin(phi)*Math.cos(a),12*Math.sin(phi)*Math.sin(a),12*Math.cos(phi)));}
  globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),gridMaterial));
}
for(let j=0;j<12;j++){
  const a=j/12*2*Math.PI,pts=[];
  for(let i=0;i<=80;i++){const phi=i/80*Math.PI;pts.push(new THREE.Vector3(12*Math.sin(phi)*Math.cos(a),12*Math.sin(phi)*Math.sin(a),12*Math.cos(phi)));}
  globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),gridMaterial));
}
const cap=new THREE.Group();scene.add(cap);cap.visible=false;
const capMesh=new THREE.Mesh(new THREE.SphereGeometry(12,48,24,0,Math.PI*2,0,Math.PI/3),new THREE.MeshBasicMaterial({color:'#ae94c5',side:THREE.DoubleSide,transparent:true,opacity:.09,depthWrite:false}));
capMesh.rotation.x=Math.PI/2;cap.add(capMesh); // Three 球面默认极轴 +Y → 原生 +Z。
for(const phi of [20,40,60]){
  const pts=[];for(let i=0;i<=120;i++)pts.push(point(centerOnCap(phi,i*3)));
  const obj=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#ab95bb',transparent:true,opacity:.45}));cap.add(obj);
}
const rcm=marker(.26,'#267e68'),tip=marker(.20,'#bd783d'),centerMarker=marker(.18,'#8f83a5'),footMarker=marker(.12,'#c07e50');
const rod=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,1,16),new THREE.MeshStandardMaterial({color:'#b47742',metalness:.4,roughness:.34}));scene.add(rod);
const directionArrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(),3,'#b47742',.7,.24);scene.add(directionArrow);
const axisLine=line('#a78660',true,.65),rcmMiss=line('#bc7052',true,.9),centerRadius=line('#9b8baa',true,.35);
const replayTrace=line('#477cbb',false,.8),initialNeedle=line('#7e8b91',true,.6);
replayTrace.visible=false;initialNeedle.visible=false;
function sprite(text,color){
  const canvas=document.createElement('canvas');canvas.width=192;canvas.height=64;
  const ctx=canvas.getContext('2d');ctx.font='500 30px sans-serif';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,96,42);
  const obj=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false,transparent:true}));obj.scale.set(4.2,1.4,1);return obj;
}
function createCoordinateAxes(origin, colors) {
  const group = new THREE.Group();
  group.position.copy(origin);
  ['X', 'Y', 'Z'].forEach((name, i) => {
    const direction = new THREE.Vector3().setComponent(i, 1);
    const arrow = new THREE.ArrowHelper(direction, new THREE.Vector3(), 7, colors[i], .7, .25);
    const label = sprite('+' + name, colors[i]);
    label.position.copy(direction).multiplyScalar(8.6);
    group.add(arrow, label);
  });
  scene.add(group);
  return group;
}

const defaultAxes = createCoordinateAxes(new THREE.Vector3(-17, -17, -7), ['#bd8074', '#77a477', '#739cae']);
const rcmAxes = createCoordinateAxes(point(RCM), ['#b34d42', '#378453', '#316a9b']);
for (const [id, axes] of [['default-axes-visible', defaultAxes], ['rcm-axes-visible', rcmAxes]]) {
  const input = $(id);
  function updateVisibility() {
    axes.visible = input.checked;
    dirty = true;
  }
  input.addEventListener('change', updateVisibility);
  updateVisibility();
}

function markView() {
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function focusEye(preset = DEFAULT_VIEW) {
  target.copy(point(center)).multiplyScalar(.65);
  distance = 67;
  view = preset;
  ({azimuth, elevation, roll} = cameraViews[preset]);
  markView();
  cameraUpdate();
}
function fitAll(){
  const points=[point(center).addScalar(12),point(center).addScalar(-12),new THREE.Vector3(),point(current.p),point(current.p).addScaledVector(V(current.n),-40)];
  const box=new THREE.Box3().setFromPoints(points),sphere=box.getBoundingSphere(new THREE.Sphere());
  target.copy(sphere.center);
  const halfFov=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
  distance=Math.max(45,sphere.radius/Math.sin(halfFov)*1.15);camera.far=Math.max(5000,distance*4);camera.updateProjectionMatrix();cameraUpdate();
}
$('fit').onclick=fitAll;$('focus-eye').onclick=()=>focusEye();
$('focus-rcm').onclick=()=>{target.set(0,0,0);distance=.45;view='free';markView();cameraUpdate();};
document.querySelectorAll('[data-view]').forEach(button => {
  button.onclick = () => focusEye(button.dataset.view);
});
function updateScene(state) {
  current = state;
  const p = point(state.p), n = V(state.n), foot = point(state.foot);
  globe.position.copy(point(center));
  centerMarker.position.copy(globe.position);
  tip.position.copy(p);
  footMarker.position.copy(foot);
  rod.position.copy(p).addScaledVector(n, -20);
  rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  rod.scale.set(1, 40, 1);
  directionArrow.position.copy(p);
  directionArrow.setDirection(n);
  const half = Math.max(45, Math.abs(state.axial) / 1000 + 15);
  setLine(axisLine, [p.clone().addScaledVector(n, -half), p.clone().addScaledVector(n, 15)]);
  setLine(rcmMiss, [new THREE.Vector3(), foot]);
  setLine(centerRadius, [new THREE.Vector3(), point(center)]);
  updateAxisVisibility();
  rod.material.color.set(state.offRCM ? '#bc5a44' : '#b47742');
  tip.material.color.set(state.outside ? '#c34c42' : '#bd783d');
  dirty = true;
}

function updateAxisVisibility() {
  axisLine.visible = $('axis-line').checked;
  rcmMiss.visible = footMarker.visible = axisLine.visible && current.offRCM;
  dirty = true;
}

function updatePathVisibility() {
  replayTrace.visible = initialNeedle.visible = hasPath && $('path-visible').checked;
  dirty = true;
}

let hasPath = false;
function showPath(plan, extraProgress) {
  hasPath = Boolean(plan);
  if (plan) {
    const points = [...Array.from({length: 1001}, (_, i) => i / 1000), ...extraProgress].sort((a, b) => a - b);
    setLine(replayTrace, points.map(u => point(forward(plan.at(u)).p)));
    const initial = forward(plan.q0);
    const p = point(initial.p);
    setLine(initialNeedle, [p.clone().addScaledVector(V(initial.n), -40), p]);
  }
  updatePathVisibility();
}

$('axis-line').onchange = updateAxisVisibility;
$('path-visible').onchange = updatePathVisibility;
$('cap-visible').onchange = () => { cap.visible = $('cap-visible').checked; dirty = true; };
$('opacity').oninput = () => {
  eye.material.opacity = $('opacity').valueAsNumber;
  $('opacity-value').textContent = Math.round(eye.material.opacity * 100) + '%';
  dirty = true;
};

const metricFields = [
  [$('rcm-error'), $('rcm-status')],
  [$('clearance'), $('inside-status')],
  [$('depth'), $('depth-status')],
];
const motorFields = LIMITS.map((limits, i) => {
  const value = $('motor-' + i);
  value.closest('dd').previousElementSibling.querySelector('.motor-limit').textContent = '[' + limits.join(', ') + ']';
  return [value, value.nextElementSibling];
});
const positionFields = ['center', 'tip', 'relative-center', 'relative-tip']
  .map(name => ['x', 'y', 'z'].map(axis => $(name + '-' + axis)));
const angleFields = [$('angle-alpha'), $('angle-beta')];
let rcmThreshold = DEFAULT_RCM_THRESHOLD;

function updateReading([value, detail], text, description, anomaly) {
  value.textContent = text;
  detail.hidden = !description;
  detail.textContent = description;
  value.closest('dd').parentElement.classList.toggle('is-anomaly', Boolean(anomaly));
}

function updateReadings(q, state) {
  const precision = value => fmt(value, value !== 0 && Math.abs(value) < .01 ? 6 : 3);
  const metrics = state ? [
    [precision(state.rcmError), state.offRCM ? '偏离 RCM' : '阈值内', state.offRCM],
    [precision(state.clearance / 1000), state.outside ? '针尖在球外' : state.nearSurface ? '接近内壁' : '针尖在球内', state.outside],
    [precision(state.axial / 1000), state.negativeDepth ? '针尖在 RCM 外侧' : state.offRCM ? '轴线偏离，仅为投影' : '', state.negativeDepth],
  ] : metricFields.map(() => ['—', '', false]);
  metricFields.forEach((field, i) => updateReading(field, ...metrics[i]));

  motorFields.forEach((field, i) => {
    const violation = state?.violations.find(item => item.motor === i);
    const limit = violation ? violation.side + ' ' + precision(violation.excess) + ' μm' : '';
    updateReading(field, q ? precision(q[i]) : '—', limit, violation);
  });
  const positions = state ? [center, state.p, sub(center, RCM), sub(state.p, RCM)] : [];
  positionFields.forEach((fields, i) => fields.forEach((field, axis) => {
    field.textContent = positions[i] ? fmt(positions[i][axis] / 1000) : '—';
  }));
  const angles = state ? [state.alpha, state.beta] : [];
  angleFields.forEach((field, i) => {
    field.textContent = state ? fmt(angles[i] * 180 / Math.PI) : '—';
  });
}

function applyFrame(q, caseCenter, progress, restart) {
  center = caseCenter ?? defaultCenter;
  const state = diagnose(q ?? INITIAL_Q, center, progress, rcmThreshold);
  updateScene(state);
  updateReadings(q, q ? state : null);
  $('scene-prompt').hidden = Boolean(q);
  if (restart) focusEye();
}

function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}
new ResizeObserver(resize).observe(host);
function label(id,p,dx,dy){
  const v=p.clone().project(camera),el=$(id),w=host.clientWidth,h=host.clientHeight;
  const x=(v.x+1)/2*w+dx,y=(1-v.y)/2*h+dy;
  el.style.left=x+'px';el.style.top=y+'px';el.hidden=v.z< -1||v.z>1||x<0||x>w-el.offsetWidth||y<65||y>h-48;
}
function draw(){
  requestAnimationFrame(draw);if(!dirty)return;dirty=false;
  const size=Math.max(.004,Math.min(8,distance/67));[tip,rcm,centerMarker,footMarker].forEach(m=>m.scale.setScalar(size));
  if(rcmAxes.visible)rcmAxes.scale.setScalar(size);
  rod.scale.x=rod.scale.z=Math.max(.004,Math.min(5,distance/67));
  renderer.render(scene,camera);label('rcm-label',new THREE.Vector3(),10,-24);label('tip-label',tip.position,10,8);label('center-label',centerMarker.position,10,-20);
}
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('error').hidden=false;$('error').textContent='WebGL 上下文丢失，请刷新页面。';});
const refreshFrame = mountCaseReplay({applyFrame, showPath});
resize();
draw();
const thresholdInput = $('rcm-threshold');
const thresholdError = $('threshold-error');
thresholdInput.value = String(rcmThreshold);
thresholdInput.addEventListener('input', () => {
  const next = thresholdInput.valueAsNumber;
  const valid = thresholdInput.validity.valid && Number.isFinite(next);
  thresholdInput.setAttribute('aria-invalid', String(!valid));
  thresholdError.hidden = valid;
  if (!valid) {
    thresholdError.textContent = `请输入大于等于 0 的数值。当前仍使用 ${rcmThreshold} μm。`;
    return;
  }
  rcmThreshold = next;
  refreshFrame();
});
