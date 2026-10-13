import type { PlayerState } from './types';
export interface Version {sha:string;branch:string;builtAt:string}
export function feedbackReport(fields:{kind:string;description:string;steps:string;expected:string},state:PlayerState,version:Version,platform:string,includeDiagnostics:boolean){
 const sections=[`## ${fields.kind}`,`### 问题描述\n${fields.description}`,`### 复现步骤\n${fields.steps}`,`### 预期行为\n${fields.expected}`,`### 实际行为\n${fields.description}`,'### 截图（可选）\n请在 GitHub 编辑器中添加截图。'];
 if(includeDiagnostics)sections.push('### 诊断（用户已选择包含）\n```json\n'+JSON.stringify({version,platform,phase:state.phase,speed:state.speed,loop:state.loop,selection:state.selection?.map(i=>i+1),range:state.range,rounds:state.rounds,errors:state.logs.slice(-12)},null,2)+'\n```');
 return sections.join('\n\n');
}
export const REPOSITORY='https://github.com/cosmos-zhan/anisong-learning-app';
export function issueUrl(report:string,kind:string){return `${REPOSITORY}/issues/new?title=${encodeURIComponent(`[${kind}] 播放器反馈`)}&body=${encodeURIComponent(report.slice(0,5500))}`;}
