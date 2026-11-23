'use strict';

// 单位：输入电机、位置均为 μm。与 ../needle-withdrawal/scripts/kinematics.py 保持一致。
const RCM = [34850, 59300, 53394];
const RADIUS = 12000;
// q5 上限由用户于 2026-11-08 更正为 29000 μm。
const LIMITS = [[0,25000],[0,25000],[0,25000],[0,25000],[-1000,29000]];
const INITIAL_Q = [12500,12500,12500,12500,6000];
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const add = (a,b) => a.map((v,i)=>v+b[i]);
const scale = (a,k) => a.map(v=>v*k);
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const norm = a => Math.hypot(...a);
function forward(q) {
  if(q.length!==5 || !q.every(Number.isFinite)) throw new Error('五个电机值必须为有限数值');
  const [q1,q2,q3,q4,q5]=q;
  const alpha=Math.atan((q3-q4)/23025), beta=Math.atan((q1-q2)/23150);
  const sa=Math.sin(alpha),ca=Math.cos(alpha),sb=Math.sin(beta),cb=Math.cos(beta);
  const length=51894+q5, b=length*ca+46800*sa+1500;
  return {p:[(q1+q2)/2-b*sb+22350*cb,(q3+q4)/2-length*sa+46800*ca,b*cb+22350*sb],
    n:[-ca*sb,-sa,ca*cb],alpha,beta};
}
function centerOnCap(phiDegrees,azimuthDegrees) {
  const phi=phiDegrees*Math.PI/180, a=azimuthDegrees*Math.PI/180;
  return add(RCM,scale([Math.sin(phi)*Math.cos(a),Math.sin(phi)*Math.sin(a),Math.cos(phi)],RADIUS));
}
function describe(q,center) {
  const f=forward(q),delta=sub(f.p,RCM),axial=dot(delta,f.n);
  const foot=sub(f.p,scale(f.n,axial)),rcmError=norm(sub(foot,RCM));
  const offset=sub(center,RCM), centerDistance=norm(offset);
  return {...f,foot,axial,rcmError,clearance:RADIUS-norm(sub(f.p,center)),
    centerAllowed:Math.abs(centerDistance-RADIUS)<=1 && offset[2]>=RADIUS/2-1,
    centerSurfaceError:Math.abs(centerDistance-RADIUS),
    motorsOK:q.every((v,i)=>v>=LIMITS[i][0]&&v<=LIMITS[i][1])};
}
