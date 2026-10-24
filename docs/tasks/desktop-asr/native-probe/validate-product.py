import sys
import subprocess, json, time, wave, threading, queue, base64, pathlib
root=pathlib.Path(__file__).resolve().parents[4]
binary=root/'apps/desktop/build/bin/darwin/Tau Speech Helper.app/Contents/MacOS/tau-speech'
records=[]
for command in ['probe','prepare']:
    start=time.monotonic(); run=subprocess.run([str(binary),command,'zh-CN'],capture_output=True,text=True,timeout=60)
    events=[json.loads(line) for line in run.stdout.splitlines()]
    records.append({'scenario':command,'exit':run.returncode,'elapsedMs':round((time.monotonic()-start)*1000),'events':events})
def launch():
    proc=subprocess.Popen([str(binary),'recognize','zh-CN'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
    output=queue.Queue()
    def read():
        for line in proc.stdout: output.put((time.monotonic(),json.loads(line)))
    threading.Thread(target=read,daemon=True).start()
    when,event=output.get(timeout=20)
    assert event['event']=='ready',event
    return proc,output
for name in ['fixture','tail','silence']:
    proc,output=launch(); start=time.monotonic()
    with wave.open(str(pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/tau-asr-p1')/(name+'.wav')),'rb') as audio:
        seq=0
        while frame:=audio.readframes(3200):
            proc.stdin.write(json.dumps({'type':'audio','seq':seq,'data':base64.b64encode(frame).decode()})+'\n');proc.stdin.flush();seq+=1
            time.sleep(len(frame)/32000)
    stop=time.monotonic();proc.stdin.write('{"type":"end"}\n');proc.stdin.close();proc.wait(timeout=15)
    events=[]
    while not output.empty():events.append(output.get())
    updates=[(when,event) for when,event in events if event['event']=='update']
    finals=[(when,event) for when,event in events if event['event']=='result']
    assert proc.returncode==0 and len(finals)==1,(name,proc.returncode,events)
    when,result=finals[0];text=result['transcript']['text']
    if name=='silence':assert text=='',text
    else:assert '春夏秋冬雨' in text,text
    records.append({'scenario':name,'exit':proc.returncode,'audioFrames':seq,'updates':len(updates),'partialUpdates':sum(not s['final'] for _,e in updates for s in e['segments']),'firstUpdateMs':round((updates[0][0]-start)*1000) if updates else None,'tailMs':round((when-stop)*1000),'finalSegments':len(result['transcript']['segments']),'tailMarkerPresent':'春夏秋冬雨' in text,'empty':not text})
proc,output=launch();start=time.monotonic();proc.kill();proc.wait(timeout=5);records.append({'scenario':'cancel','exit':proc.returncode,'elapsedMs':round((time.monotonic()-start)*1000)})
proc,output=launch();proc.stdin.write('{"type":"audio","seq":8,"data":"AAA="}\n');proc.stdin.flush();proc.wait(timeout=5);records.append({'scenario':'invalid-sequence','exit':proc.returncode});assert proc.returncode!=0
path=root/'docs/tasks/desktop-asr/evidence/p3-native-summary.json';path.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n');print(json.dumps(records,ensure_ascii=False,indent=2))
