"""Single subscription completion. Keys stay local; raw/receipt precede validation."""
from pathlib import Path
import json,os,sys,time,urllib.request,urllib.error

def atomic(path,value):
    tmp=path.with_suffix(path.suffix+'.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,path)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def run(request_path):
    source=Path(request_path);out=source.parent;config=json.loads(source.read_text(encoding='utf-8'))
    settings=config['settings'];started=time.time();receipt={'model':settings['model'],'generation_id':None,'usage':None,'cost':None,'finish_reason':None,'status':'running','started_at':started}
    atomic(out/'receipt.json',receipt)
    content=[];reasoning=[];finish=None;usage=None;gid=None;actual_model=settings['model']
    try:
        key=Path(settings['keyFile']).read_text(encoding='utf-8').strip()
        if not key:raise ValueError('missing_subscription_key')
        payload={'model':settings['model'],'messages':config['messages'],'stream':True,'thinking':{'type':'enabled'},'reasoning_effort':settings['effort']}
        # Deliberately no max_tokens override, retry or pay-as-you-go fallback.
        proxy=settings.get('proxy','')
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({'http':proxy,'https':proxy} if proxy else {}),NoRedirect())
        req=urllib.request.Request('https://api.z.ai/api/coding/paas/v4/chat/completions',data=json.dumps(payload,ensure_ascii=False).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','Accept':'text/event-stream','User-Agent':'Motivelium/0.1'})
        with opener.open(req,timeout=150) as response:
            with (out/'stream.ndjson').open('w',encoding='utf-8') as stream:
                size=0
                for raw_line in response:
                    size+=len(raw_line)
                    if size>24*1024*1024:raise ValueError('response_too_large')
                    line=raw_line.decode('utf-8').strip()
                    if not line or not line.startswith('data:'):continue
                    data=line[5:].strip()
                    if data=='[DONE]':break
                    event=json.loads(data);stream.write(json.dumps(event,ensure_ascii=False)+'\n');stream.flush()
                    gid=event.get('id') or gid;actual_model=event.get('model') or actual_model;usage=event.get('usage') or usage
                    for choice in event.get('choices',[]):
                        delta=choice.get('delta',{})
                        if isinstance(delta.get('content'),str):content.append(delta['content'])
                        if isinstance(delta.get('reasoning_content'),str):reasoning.append(delta['reasoning_content'])
                        finish=choice.get('finish_reason') or finish
        raw={'id':gid,'model':actual_model,'usage':usage,'choices':[{'message':{'content':''.join(content),'reasoning_content':''.join(reasoning)},'finish_reason':finish}]}
        atomic(out/'raw-response.json',raw)
        receipt.update(model=actual_model,generation_id=gid,usage=usage,finish_reason=finish,elapsed_seconds=round(time.time()-started,3))
        if finish!='stop':raise ValueError('incomplete_response_'+str(finish))
        if not ''.join(content).strip():raise ValueError('empty_final_response')
        receipt['status']='complete';atomic(out/'receipt.json',receipt)
        atomic(out/'completion.json',{'content':''.join(content),'model':actual_model,'generationId':gid,'usage':usage,'finishReason':finish})
        return 0
    except urllib.error.HTTPError as error:
        (out/'raw-error.bin').write_bytes(error.read());receipt.update(status='failed',error='provider_http_'+str(error.code),elapsed_seconds=round(time.time()-started,3));atomic(out/'receipt.json',receipt);return 2
    except Exception as error:
        if not (out/'raw-response.json').exists():atomic(out/'raw-response.json',{'id':gid,'model':actual_model,'usage':usage,'choices':[{'message':{'content':''.join(content),'reasoning_content':''.join(reasoning)},'finish_reason':finish}]})
        receipt.update(status='failed',generation_id=gid,usage=usage,finish_reason=finish,error=type(error).__name__+': '+str(error)[:300],elapsed_seconds=round(time.time()-started,3));atomic(out/'receipt.json',receipt);return 2

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8');sys.exit(run(sys.argv[1]))
