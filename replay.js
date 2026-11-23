'use strict';

// OrdinaryExit.run 的浮点回放；单位 μm，进度 u ∈ [0,1]。
// 分支只按初态选一次；不修正 RCM，不夹紧越限电机。
const REFERENCE_Q=[12500,12500,12500,12500,0];
const DEFAULT_RCM_THRESHOLD=150; // μm：仿真中判定 RCM 偏离的默认阈值。
const GEOMETRY_TOLERANCE=1; // μm：球面、深度和终点判定的浮点容差。
const MOTOR_TOLERANCE=1e-6;
const lerp=(a,b,u)=>a.map((v,i)=>(1-u)*v+u*b[i]);
function selectBranch(q){
  if(q[4]<0){
    if(q[0]<2000&&q[2]>23000)return 'A';
    if(q[0]>23000&&q[2]>23000)return 'B';
    return 'C';
  }
  return q[4]<5000?'D':'E';
}
function inversePose(r,a,b){
  const B=(r[2]-22350*Math.sin(b))/Math.cos(b);
  const q5=(B-1500-46800*Math.sin(a))/Math.cos(a)-51894;
  const s12=r[0]+B*Math.sin(b)-22350*Math.cos(b);
  const s34=r[1]+(51894+q5)*Math.sin(a)-46800*Math.cos(a);
  return [s12+11575*Math.tan(b),s12-11575*Math.tan(b),
    s34+11512.5*Math.tan(a),s34-11512.5*Math.tan(a),q5];
}
function makePlan(initial){
  const q0=[...initial],pose=forward(q0),branch=selectBranch(q0);
  const first=[12500,12500,q0[2],q0[3],q0[4]],four=[12500,12500,12500,12500,q0[4]];
  return {branch,q0,at(u){
    if(!Number.isFinite(u)||u<0||u>1)throw new RangeError('退针进度必须在 0～1 之间');
    if(u===0)return [...q0];
    if(u===1)return [...REFERENCE_Q];
    if(branch==='A')return u<=1/3?lerp(q0,first,3*u):u<=2/3?
      lerp(first,four,3*u-1):lerp(four,REFERENCE_Q,3*u-2);
    if(branch==='B')return u<=.5?lerp(q0,four,2*u):lerp(four,REFERENCE_Q,2*u-1);
    return inversePose(lerp(pose.p,RCM,u),(1-u)*pose.alpha,(1-u)*pose.beta);
  }};
}
function stageAt(branch,u){
  if(u>=1)return '已到 RCM，播放结束';
  if(branch==='A')return u<=1/3?'第一段 · 第一对电机回正':u<=2/3?'第二段 · 第二对电机回正':'第三段 · Q5 回到 0';
  if(branch==='B')return u<=.5?'第一段 · 前四电机一起回正':'第二段 · Q5 回到 0';
  return '针尖位置与姿态同步插值，再计算五电机值';
}
function branchBreakpoints(branch) {
  return branch === 'A' ? [1/3, 2/3] : branch === 'B' ? [.5] : [];
}
function diagnose(q,center,u=0,rcmThreshold=DEFAULT_RCM_THRESHOLD){
  const state=describe(q,center);
  const violations=q.flatMap((value,i)=>{
    const [lo,hi]=LIMITS[i];
    return value<lo-MOTOR_TOLERANCE?[{motor:i,value,bound:lo,excess:lo-value,side:'低于下限'}]:
      value>hi+MOTOR_TOLERANCE?[{motor:i,value,bound:hi,excess:value-hi,side:'高于上限'}]:[];
  });
  return {...state,violations,offRCM:state.rcmError>rcmThreshold,
    // 不共线时，投影为负不能单独冒充“已证明负深度”。
    negativeDepth:state.rcmError<=GEOMETRY_TOLERANCE&&state.axial< -GEOMETRY_TOLERANCE,
    outside:state.clearance< -GEOMETRY_TOLERANCE,
    nearSurface:Math.abs(state.clearance)<=GEOMETRY_TOLERANCE,
    finished:u>=1&&Math.hypot(...state.p.map((v,i)=>v-RCM[i]))<=GEOMETRY_TOLERANCE};
}
