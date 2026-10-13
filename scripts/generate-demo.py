"""Original CC0 synthesis. No commercial song samples. Timings match demo.lrc."""
import math, wave, struct, os
rate=22050
segments=[(0,16.3,[60,64,67,64,62,65,69,65]),(16.3,21.1,[64,67,69,67,64,62]),(21.1,25.9,[62,65,67,65,62,60]),(25.9,30.7,[60,64,67,72,69,67]),(30.7,35.5,[65,64,62,60])]
os.makedirs('public/demo',exist_ok=True)
with wave.open('public/demo/demo.wav','wb') as f:
 f.setparams((1,2,rate,0,'NONE','not compressed'))
 data=bytearray()
 for n in range(round(35.5*rate)):
  t=n/rate
  start,end,notes=next(s for s in segments if s[0]<=t<s[1])
  beat=(end-start)/len(notes); phase=(t-start)%beat; midi=notes[min(int((t-start)/beat),len(notes)-1)]
  hz=440*2**((midi-69)/12); env=min(1,phase/.025)*min(1,max(0,beat-phase)/.09)*math.exp(-phase*.9)
  sample=(math.sin(2*math.pi*hz*phase)+.2*math.sin(4*math.pi*hz*phase))*.27*env
  data.extend(struct.pack('<h',round(sample*32767)))
 f.writeframes(data)
