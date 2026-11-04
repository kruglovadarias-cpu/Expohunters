"""3D single-sheet transition from the sketch to the finished project.
Run with Python 3 and moderngl, glcontext, Pillow and NumPy; requires EGL and FFmpeg.
"""
import argparse,hashlib,json,math,os,random,subprocess,time
from pathlib import Path
import numpy as np
import moderngl
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
CONFIG=json.loads((ROOT/'design/portfolio-crumple/config.json').read_text())
random.seed(318)
NU,NV=CONFIG['mesh']['columns'],CONFIG['mesh']['rows']
uv=[]
for j in range(NV+1):
 for i in range(NU+1):
  u=(i+(random.uniform(-.3,.3) if 0<i<NU and 0<j<NV else 0))/NU
  v=(j+(random.uniform(-.3,.3) if 0<i<NU and 0<j<NV else 0))/NV
  uv.append((u,v))
faces=[]
for j in range(NV):
 for i in range(NU):
  a=j*(NU+1)+i;b=a+1;c=a+NU+1;d=c+1
  faces.extend([(a,b,d),(a,d,c)] if (i+j)%2 else [(a,b,c),(b,d,c)])
ru=random.Random(52);rv=random.Random(91)
thetaU=[(-1 if i%2 else 1)*ru.uniform(1.15,1.85) for i in range(8)]
thetaV=[(-1 if i%2 else 1)*rv.uniform(1.15,1.85) for i in range(7)]
phiU=[ru.uniform(-.6,.6) for i in thetaU];phiV=[rv.uniform(-.6,.6) for i in thetaV]
weightsU=[ru.uniform(.55,1.5) for _ in thetaU];weightsV=[rv.uniform(.55,1.5) for _ in thetaV]
noise=[random.uniform(-.35,.35) for _ in uv]
def tri(x):return 2*abs(2*(x-math.floor(x)) -1)-1

def path(t,angles,azimuths,length,a,vertical=False):
 weights=weightsV if vertical else weightsU
 total=sum(weights);p=[0,0,0];start=0
 for weight,angle,azimuth in zip(weights,angles,azimuths):
  fraction=weight/total;factor=max(0,min(1,(t-start)/fraction));start+=fraction
  theta=angle*a;azimuth*=a;c=math.cos(theta);si=math.sin(theta);ca=math.cos(azimuth);sa=math.sin(azimuth)
  direction=(-c*sa,c*ca,si) if vertical else (c*ca,c*sa,si)
  for q in range(3):p[q]+=factor*length*fraction*direction[q]
 return p

def positions(a):
 result=[]
 for k,(u,v) in enumerate(uv):
  angle=math.radians(CONFIG['mesh']['foldAxisDegrees']);ca=math.cos(angle);sa=math.sin(angle)
  x=(u-.5)*CONFIG['card']['width'];y=(v-.5)*CONFIG['card']['height']
  lu=ca*CONFIG['card']['width']+sa*CONFIG['card']['height'];lv=sa*CONFIG['card']['width']+ca*CONFIG['card']['height']
  tu=(ca*x+sa*y)/lu+.5;tv=(-sa*x+ca*y)/lv+.5
  pu=path(tu,thetaU,phiU,lu,a);pv=path(tv,thetaV,phiV,lv,a,True)
  folded=[pu[q]+pv[q] for q in range(3)]
  p=[ca*folded[0]-sa*folded[1],sa*folded[0]+ca*folded[1],folded[2]]
  p[2]+=a**1.4*(10*tri((u+1.3*v)*4+.2)+6*tri((1.7*u-.9*v)*3.5+.5)+noise[k])
  result.append(p)
 center=[sum(p[q] for p in result)/len(result) for q in range(3)]
 compact=max(0,min(1,(a-.82)/.18));compact=compact**3*(compact*(compact*6-15)+10)
 volume=1+(CONFIG['mesh']['compactVolumeScale']-1)*compact
 return [tuple((p[q]-center[q])/1000*volume for q in range(3)) for p in result]


def normalize(v):return v/np.linalg.norm(v)
def look(eye,target,up):
 eye=np.array(eye,float);target=np.array(target,float);up=np.array(up,float)
 f=normalize(target-eye);s=normalize(np.cross(f,up));u=np.cross(s,f)
 m=np.eye(4);m[:3,:3]=np.array([s,u,-f]);m[:3,3]=-m[:3,:3]@eye;return m

def ortho(l,r,b,t,n,f):
 return np.array([[2/(r-l),0,0,-(r+l)/(r-l)],[0,2/(t-b),0,-(t+b)/(t-b)],[0,0,-2/(f-n),-(f+n)/(f-n)],[0,0,0,1]],float)
ctx=moderngl.create_standalone_context(backend='egl',require=330)
W,H=CONFIG['width'],CONFIG['height']
faces_np=np.array(faces,np.int32)
vbo=ctx.buffer(reserve=len(uv)*8*4);ibo=ctx.buffer(faces_np.astype('u4').tobytes())
prog=ctx.program(vertex_shader='''#version 330
in vec3 in_pos;in vec3 in_normal;in vec2 in_uv;
uniform mat4 camera;uniform mat4 light;
out vec2 uv;out vec3 normal;out vec3 position;out vec4 shadow_position;
void main(){uv=in_uv;normal=in_normal;position=in_pos;shadow_position=light*vec4(in_pos,1);gl_Position=camera*vec4(in_pos,1);}
''',fragment_shader='''#version 330
in vec2 uv;in vec3 normal;in vec3 position;in vec4 shadow_position;
uniform sampler2D design;uniform sampler2D finished_design;uniform float design_mix;uniform sampler2D shadow_map;uniform vec3 light_direction;
out vec4 color;
void main(){
 vec3 ns=normalize(normal);if(!gl_FrontFacing)ns=-ns;
 vec3 nf=normalize(cross(dFdx(position),dFdy(position)));if(nf.z<0)nf=-nf;
 vec3 n=normalize(mix(ns,nf,.2));
 vec3 q=shadow_position.xyz/shadow_position.w*.5+.5;
 float visible=0;float bias=.0015+.0015*(1-max(dot(n,light_direction),0));
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)visible+=q.z-bias<=texture(shadow_map,q.xy+vec2(x,y)/1024.).r?1.:0.;
 visible/=9.;
 vec3 printed=gl_FrontFacing?mix(texture(design,uv).rgb,texture(finished_design,uv).rgb,design_mix):vec3(.963,.963,.98);
 vec3 linear=pow(printed,vec3(2.2));
 float shade=(.55+.45*max(dot(n,light_direction),0)*(.45+.55*visible))/(.55+.45*light_direction.z);
 color=vec4(pow(clamp(linear*shade,0,1),vec3(1/2.2)),1);
}''')
shadowprog=ctx.program(vertex_shader='''#version 330
in vec3 in_pos;uniform mat4 light;
void main(){gl_Position=light*vec4(in_pos,1);}
''',fragment_shader='''#version 330
void main(){}
''')
vao=ctx.vertex_array(prog,[(vbo,'3f 3f 2f','in_pos','in_normal','in_uv')],ibo)
svao=ctx.vertex_array(shadowprog,[(vbo,'3f 20x','in_pos')],ibo)
shadowtex=ctx.depth_texture((1024,1024));shadowtex.compare_func='';shadowtex.repeat_x=False;shadowtex.repeat_y=False
shadowfbo=ctx.framebuffer(depth_attachment=shadowtex)
msaa=ctx.framebuffer(color_attachments=[ctx.renderbuffer((W,H),4,samples=4)],depth_attachment=ctx.depth_renderbuffer((W,H),samples=4))
resolve=ctx.simple_framebuffer((W,H),4)
L=normalize(np.array([-.55,.8,1.6]));lightmatrix=ortho(-.65,.65,-.65,.65,.1,4)@look(L*2,(0,0,0),(0,1,0))
camera=ortho(-.54,.54,-.675,.675,.1,10)@look((0,0,2.5),(0,0,0),(0,1,0))
prog['camera'].write(camera.T.astype('f4').tobytes());prog['light'].write(lightmatrix.T.astype('f4').tobytes());prog['light_direction'].value=tuple(L)
shadowprog['light'].write(lightmatrix.T.astype('f4').tobytes())
im=Image.open(ROOT/CONFIG['sourceSketch']).convert('RGB').transpose(Image.Transpose.FLIP_TOP_BOTTOM)
texture=ctx.texture(im.size,3,im.tobytes());texture.build_mipmaps();texture.filter=(moderngl.LINEAR_MIPMAP_LINEAR,moderngl.LINEAR);texture.repeat_x=False;texture.repeat_y=False
finished_image=Image.open(ROOT/CONFIG['sourceFinished']).convert('RGB').transpose(Image.Transpose.FLIP_TOP_BOTTOM)
finished_texture=ctx.texture(finished_image.size,3,finished_image.tobytes());finished_texture.build_mipmaps();finished_texture.filter=(moderngl.LINEAR_MIPMAP_LINEAR,moderngl.LINEAR);finished_texture.repeat_x=False;finished_texture.repeat_y=False
prog['design'].value=0;prog['shadow_map'].value=1;prog['finished_design'].value=2
bg=np.array(Image.open(ROOT/CONFIG['sourceBackground']).convert('RGB').resize((W,H),Image.Resampling.LANCZOS)).astype(np.float32)
ctx.enable(moderngl.DEPTH_TEST);ctx.disable(moderngl.CULL_FACE|moderngl.BLEND)


def draw(a,design_mix=0):
 p=np.array(positions(a),np.float32)
 f=p[faces_np];fn=np.cross(f[:,1]-f[:,0],f[:,2]-f[:,0]);normals=np.zeros_like(p)
 for k in range(3):np.add.at(normals,faces_np[:,k],fn)
 lengths=np.linalg.norm(normals,axis=1);lengths[lengths<1e-8]=1;normals/=lengths[:,None]
 data=np.column_stack([p,normals,np.array(uv,np.float32)]).astype('f4');vbo.write(data.tobytes())
 shadowfbo.use();ctx.viewport=(0,0,1024,1024);shadowfbo.clear(depth=1);svao.render()
 msaa.use();ctx.viewport=(0,0,W,H);msaa.clear(0,0,0,0,depth=1);texture.use(0);shadowtex.use(1);finished_texture.use(2);prog['design_mix'].value=design_mix;vao.render();ctx.copy_framebuffer(resolve,msaa)
 rgba=np.frombuffer(resolve.read(components=4,alignment=1),np.uint8).reshape(H,W,4)[::-1].astype(np.float32)
 rgb=np.rint(rgba[:,:,:3]+bg*(1-rgba[:,:,3:4]/255)).clip(0,255).astype(np.uint8)
 return rgb,rgba



def ease(t):
 t=max(0,min(1,t));return t*t*t*(t*(t*6-15)+10)

def state(t):
 timing=CONFIG['timeline']
 if t<timing['sketchHoldEnd']:fold=0
 elif t<timing['crumpleEnd']:fold=ease((t-timing['sketchHoldEnd'])/(timing['crumpleEnd']-timing['sketchHoldEnd']))
 elif t<timing['unfoldStart']:fold=1
 elif t<timing['unfoldEnd']:fold=1-ease((t-timing['unfoldStart'])/(timing['unfoldEnd']-timing['unfoldStart']))
 else:fold=0
 mix=ease((t-timing['designChangeStart'])/(timing['designChangeEnd']-timing['designChangeStart']))
 return fold*CONFIG['mesh']['maxFold'],mix

def render(output,preview=False):
 output.parent.mkdir(parents=True,exist_ok=True)
 fps=CONFIG['fps'];count=round(CONFIG['durationSeconds']*fps)
 snapshots={0:'sketch',round(2.35*fps):'closing',round(3.2*fps):'crumpled',round(4.7*fps):'opening',count-1:'finished'}
 if preview:
  for t in [0,2.35,3.2,4.7,7.5]:
   fold,mix=state(t);rgb,rgba=draw(fold,mix);Image.fromarray(rgb).save(f'/tmp/expo-paper-preview-{t}.png')
  return
 encoder=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(fps),'-i','pipe:0','-an','-c:v','libx264','-preset',CONFIG['encoding']['preset'],'-crf',str(CONFIG['encoding']['crf']),'-tune','stillimage','-pix_fmt','yuv420p','-threads','4','-g',str(count),'-keyint_min',str(count),'-sc_threshold','0','-movflags','+faststart','-frames:v',str(count),str(output)],stdin=subprocess.PIPE)
 trace=[];cached_key=None;cached_frame=None;start=time.time()
 try:
  for i in range(count):
   t=i/fps;fold,mix=state(t);key=(fold,mix)
   if key!=cached_key:
    rgb,rgba=draw(fold,mix);cached_frame=rgb.tobytes();cached_key=key
    ys,xs=np.where(rgba[:,:,3]>.5)
    bounds=[int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1]
   trace.append({'frame':i,'time':t,'fold':fold,'finishedDesignMix':mix,'bounds':bounds})
   if i in snapshots:Image.frombytes('RGB',(W,H),cached_frame).save(f'/tmp/expo-paper-{snapshots[i]}.png')
   encoder.stdin.write(cached_frame)
   if (i+1)%60==0:print(json.dumps({'renderedFrames':i+1,'totalFrames':count,'elapsedSeconds':round(time.time()-start,1),'fold':fold,'designMix':mix}),flush=True)
 finally:
  encoder.stdin.close();encoder.wait()
 if encoder.returncode:raise RuntimeError('MP4 encoding failed')
 metadata={**CONFIG,'file':str(output.relative_to(ROOT)) if output.is_relative_to(ROOT) else str(output),'frameCount':count,'codec':'H.264','pixelFormat':'yuv420p','audio':False,'effect':'One continuous textured 3D paper mesh crumples at center and unfolds into the finished project','sequence':['flat sketch','crumple','change print only while fully crumpled','unfold finished project','flat finished project'],'background':'Stationary image','renderer':ctx.info['GL_RENDERER'],'trace':trace,'sources':{name:hashlib.sha256((ROOT/CONFIG[name]).read_bytes()).hexdigest() for name in ['sourceSketch','sourceFinished','sourceBackground']},'sizeBytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
 (ROOT/'design/portfolio-crumple/video.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:metadata[k] for k in ['file','frameCount','sizeBytes','sha256']}),flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=ROOT/'docs/downloads/expohunters-portfolio-paper-transition-8s.mp4');parser.add_argument('--preview',action='store_true');args=parser.parse_args();render(args.output.resolve(),args.preview)
