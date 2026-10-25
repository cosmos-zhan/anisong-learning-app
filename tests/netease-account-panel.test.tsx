import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {NeteaseAccountPanel,type AccountClient} from '../apps/web/src/downloads/NeteaseAccountPanel';
afterEach(cleanup);
test('SMS login requires an explicit send and submit, clears its inputs, and reports only account status',async()=>{
 const calls:string[]=[];
 const client:AccountClient=vi.fn(async(action)=>{calls.push(action);if(action==='status')return {loggedIn:false};if(action==='captcha')return {sent:true,retryAfter:60};return {loggedIn:true,nickname:'测试用户'};});
 const changed=vi.fn(),busy=vi.fn();render(<NeteaseAccountPanel client={client} disabled={false} onBusy={busy} onChanged={changed}/>);
 await waitFor(()=>expect(calls).toEqual(['status']));expect(changed).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('网易云手机号'),{target:{value:'12345678901'}});
 fireEvent.click(screen.getByRole('button',{name:'发送验证码'}));await screen.findByText('短信已发送，请输入验证码登录。');
 expect(calls).toEqual(['status','captcha']);expect(screen.getByRole('button',{name:'60 秒后重发'})).toBeDisabled();
 fireEvent.change(screen.getByLabelText('网易云短信验证码'),{target:{value:'123456'}});fireEvent.click(screen.getByRole('button',{name:'验证码登录'}));
 await screen.findByText('已登录 · 测试用户');expect(changed).toHaveBeenCalledTimes(1);expect(calls).toEqual(['status','captcha','sms-login']);
 expect(screen.queryByLabelText('网易云短信验证码')).not.toBeInTheDocument();expect(busy).toHaveBeenLastCalledWith(false);
});
test('provider login errors stay visible without marking an account as logged in',async()=>{
 const client:AccountClient=async(action)=>{if(action==='status')return {loggedIn:false};throw new Error('网易云要求安全验证');};
 const changed=vi.fn();render(<NeteaseAccountPanel client={client} disabled={false} onBusy={()=>{}} onChanged={changed}/>);
 fireEvent.change(screen.getByLabelText('网易云手机号'),{target:{value:'12345678901'}});fireEvent.click(screen.getByRole('button',{name:'发送验证码'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('网易云要求安全验证');expect(changed).not.toHaveBeenCalled();expect(screen.getByText('未登录')).toBeInTheDocument();
});
