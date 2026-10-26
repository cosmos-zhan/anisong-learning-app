import {fireEvent,render,screen} from '@testing-library/react';
import {expect,test,vi} from 'vitest';
vi.mock('../packages/core/netease-account-client',()=>({deviceNeteaseAccount:async()=>({loggedIn:true,nickname:'Fixture'})}));
vi.mock('../packages/core/netease',()=>({parseNetease:async()=>({
  song:{id:'123',title:'Fixture song',artists:'Fixture artist'},
  lyrics:{counts:{original:1,romaji:1,translation:1},warnings:[]},
  audio:{status:'unavailable',message:'音频文件访问被拒绝（HTTP 403）。文件服务器未允许本次请求，不能据此判断会员权限。',
    diagnostics:[{source:'download-v1',quality:'exhigh',stage:'audio',reason:'http',http:403},
      {source:'player-v1',quality:'exhigh',stage:'address',reason:'provider',code:500}]},
}),importNetease:vi.fn()}));
import {NeteaseLocalImport} from '../apps/web/src/downloads/NeteaseLocalImport';
test('a failed import presents file versus address status and leaves download unavailable',async()=>{
  render(<NeteaseLocalImport disabled={false} onBusy={()=>{}} onSaved={()=>{}}/>);
  fireEvent.click(screen.getByText('从网易云分享链接导入'));
  fireEvent.change(screen.getByLabelText('分享链接或歌曲 ID'),{target:{value:'123'}});
  fireEvent.click(screen.getByRole('button',{name:'解析歌曲'}));
  expect(await screen.findByText('Fixture song')).toBeInTheDocument();
  fireEvent.click(screen.getByText('音频获取详情'));
  expect(screen.getByText('下载接口 / 极高音质：检查文件，请求失败（HTTP 403）')).toBeInTheDocument();
  expect(screen.getByText('播放接口 / 极高音质：获取地址，接口拒绝（返回码 500）')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'下载并导入本机'})).toBeDisabled();
});
