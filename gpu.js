export const WIDTH=64,HEIGHT=32,CAPACITY=WIDTH*HEIGHT,HISTORY=32;
const quad=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
const integrate=`#version 300 es
precision highp float;precision highp int;
uniform sampler2D positions,velocities,destinations,meshLinks;uniform int meshCount,meshSlots;uniform float meshStiffness,meshBending,meshDamping,meshScale;uniform int count,phase;uniform float dt,softening,massScale,ringStrength,ringRadius,ringSpeed;uniform int ringCount;
layout(location=0) out vec4 nextPosition;layout(location=1) out vec4 nextVelocity;
void main(){ivec2 uv=ivec2(gl_FragCoord.xy);int id=uv.y*64+uv.x;vec4 p=texelFetch(positions,uv,0),v=texelFetch(velocities,uv,0);
if(id>=count){nextPosition=vec4(0);nextVelocity=vec4(0);return;}
// Guided modes: -2 attract (negative mass means delayed), -3 delayed repel, -4 active repel.
if(v.w<-.5){
 if(v.w<-1.5&&phase==0){vec3 target=texelFetch(destinations,uv,0).xyz;vec3 delta=target-p.xyz;float remaining=length(delta),travel=length(v.xyz)*dt;
  if(remaining<=travel||remaining<.00001){p.xyz=target;p.w=v.w<-2.5?-abs(p.w):abs(p.w);v=vec4(0,0,0,-1);}
  else {v.xyz=normalize(delta)*length(v.xyz);p.xyz+=v.xyz*dt;}
 }
 nextPosition=p;nextVelocity=v;return;
}
vec3 a=vec3(0);for(int j=0;j<2048;j++){if(j>=count)break;if(j==id)continue;vec4 q=texelFetch(positions,ivec2(j%64,j/64),0);if(q.w==0.)continue;if(q.w<0.){float mode=texelFetch(velocities,ivec2(j%64,j/64),0).w;if(mode<-1.5&&mode>-3.5)continue;}vec3 d=q.xyz-p.xyz;float inv=inversesqrt(dot(d,d)+softening*softening);a+=massScale*q.w*d*inv*inv*inv;}
// Optional feedback only for the original Maxwell-ring bodies, relative to its centre.
if(ringStrength>0.&&id>0&&id<ringCount){
 vec3 centre=texelFetch(positions,ivec2(0),0).xyz,drift=texelFetch(velocities,ivec2(0),0).xyz;
 vec3 offset=p.xyz-centre,relativeVelocity=v.xyz-drift;float radius=length(offset.xz);
 if(radius>.0001){vec3 radial=vec3(offset.x,0.,offset.z)/radius,tangent=vec3(-radial.z,0.,radial.x);
 float gain=.25*ringStrength,damping=.7*sqrt(ringStrength);
 a+=(-gain*(radius-ringRadius)-damping*dot(relativeVelocity,radial))*radial;
 a.y+=-gain*offset.y-damping*relativeVelocity.y;
 a+=.5*damping*(ringSpeed-dot(relativeVelocity,tangent))*tangent;
 }
}
// Equal-mass shell links exert equal/opposite central forces; there is no world anchor.
if(id<meshCount){for(int slot=0;slot<24;slot++){if(slot>=meshSlots)break;vec4 link=texelFetch(meshLinks,ivec2(slot,id),0);if(link.w==0.)continue;
 int j=int(link.x);vec3 d=texelFetch(positions,ivec2(j%64,j/64),0).xyz-p.xyz;float r=length(d);if(r<.00001)continue;
 vec3 direction=d/r,relative=texelFetch(velocities,ivec2(j%64,j/64),0).xyz-v.xyz;float stiffness=link.z<.5?meshStiffness:meshBending;
 a+=(meshScale*stiffness*(r-link.y)+meshDamping*dot(relative,direction))*direction;
}}
v.xyz+=a*(0.5*dt);if(phase==0)p.xyz+=v.xyz*dt;
nextPosition=p;nextVelocity=v;}`;
const points=`#version 300 es
precision highp float;precision highp int;
uniform sampler2D positions,history,bodyStyle;uniform vec3 right,up,back,eye;uniform float aspect,pixelRatio,blobSize,maxPointSize,zoomScale;uniform int count,trail,head,filled,meshCount;uniform float meshPointScale;
out vec3 color;out float opacity;
void main(){int id=gl_VertexID%count;int age=gl_VertexID/count;vec4 p;
if(trail==1){int slot=(head-1-age+32)%32;p=texelFetch(history,ivec2(id%64,(id/64)+slot*32),0);}else{p=texelFetch(positions,ivec2(id%64,id/64),0);}
vec3 d=p.xyz-eye;float z=-dot(d,back);vec3 view=vec3(dot(d,right),dot(d,up),z);
float near=0.0005,far=10000.;gl_Position=vec4(view.x*1.8*zoomScale/aspect,view.y*1.8*zoomScale,(far+near)/(far-near)*z-2.*far*near/(far-near),z);
if(p.w==0.||z<near)gl_Position=vec4(2,2,2,1);
// Golden-angle hue spacing keeps each body's saturated color stable as bodies are added.
float hue=fract(float(id)*0.618033989);
vec3 rainbow=clamp(abs(fract(vec3(hue)+vec3(0.,2./3.,1./3.))*6.-3.)-1.,0.,1.);
vec4 style=texelFetch(bodyStyle,ivec2(id%64,id/64),0);
color=style.w>0.?style.rgb:.95*rainbow;
float size=blobSize*(style.w>0.?style.w:1.)*(id<meshCount?meshPointScale:1.);
float scale=trail==1?sqrt(size):size;
gl_PointSize=min(maxPointSize,zoomScale*scale*clamp((trail==1?2.:5.)*pixelRatio*(8./max(z,1.)),trail==1?1.:2.,trail==1?4.:14.));
opacity=trail==1?0.24*(1.-float(age)/float(max(filled,1))):1.;}`;
const glow=`#version 300 es
precision highp float;in vec3 color;in float opacity;out vec4 result;
void main(){float r=length(gl_PointCoord*2.-1.);if(r>1.)discard;float weight=opacity*(1.-smoothstep(.25,1.,r));result=vec4(color*weight,weight);}`;
const edges=`#version 300 es
precision highp float;precision highp int;
flat out float feature;uniform sampler2D positions,meshEdges;uniform vec3 right,up,back,eye;uniform float aspect,zoomScale;
void main(){int edge=gl_VertexID/2;vec4 ids=texelFetch(meshEdges,ivec2(edge%256,edge/256),0);feature=ids.z;int id=int(gl_VertexID%2==0?ids.x:ids.y);
 vec3 d=texelFetch(positions,ivec2(id%64,id/64),0).xyz-eye;float z=-dot(d,back),near=.0005,far=10000.;
 gl_Position=vec4(dot(d,right)*1.8*zoomScale/aspect,dot(d,up)*1.8*zoomScale,(far+near)/(far-near)*z-2.*far*near/(far-near),z);
}`;
const surface=`#version 300 es
precision highp float;precision highp int;
uniform sampler2D positions,meshFaces;uniform vec3 right,up,back,eye;uniform float aspect,zoomScale;
void main(){int face=gl_VertexID/3;vec3 ids=texelFetch(meshFaces,ivec2(face%256,face/256),0).xyz;int id=int(ids[gl_VertexID%3]);
 vec3 d=texelFetch(positions,ivec2(id%64,id/64),0).xyz-eye;float z=-dot(d,back),near=.0005,far=10000.;
 gl_Position=vec4(dot(d,right)*1.8*zoomScale/aspect,dot(d,up)*1.8*zoomScale,(far+near)/(far-near)*z-2.*far*near/(far-near),z);
}`;
const edgeColor=`#version 300 es
precision highp float;flat in float feature;out vec4 result;void main(){result=feature<.5?vec4(.06,.48,.56,.6):feature<1.5?vec4(.15,.85,.55,1):feature<2.5?vec4(.95,.10,.4,1):vec4(.95,.54,.05,1);}`;
const composite=`#version 300 es
precision highp float;
uniform sampler2D accumulation;uniform vec3 overlapColor;
out vec4 result;
void main(){
 vec4 sum=texelFetch(accumulation,ivec2(gl_FragCoord.xy),0);
 vec3 average=sum.rgb/max(sum.a,.00001);
 float crowd=smoothstep(1.,3.,sum.a);
 vec3 color=mix(average,overlapColor,crowd);
 result=vec4(mix(vec3(.018,.029,.055),color,clamp(sum.a,0.,1.)),1.);
}`;
export class GravityGPU {
 constructor(canvas){this.canvas=canvas;const gl=this.gl=canvas.getContext('webgl2',{antialias:false,alpha:false});if(!gl)throw Error('WebGL2 is unavailable on this browser.');if(!gl.getExtension('EXT_color_buffer_float'))throw Error('This GPU cannot render the floating-point textures required for gravity.');
 this.overlapColor=[1,.231,.616];this.displayWidth=0;this.displayHeight=0;this.accumulation=null;this.displayFramebuffer=null;this.composite=this.program(quad,composite);this.blobSize=1;this.zoomScale=1;this.maxPointSize=gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];this.massScale=1;this.meshScale=1;this.meshPointScale=1;this.meshHiddenSurface=false;this.meshFaceCount=0;this.meshCount=0;this.meshSlots=0;this.meshEdgeCount=0;this.meshStiffness=30;this.meshBending=10;this.meshDamping=2;this.edgeRender=this.program(edges,edgeColor);this.surfaceRender=this.program(surface,`#version 300 es\nprecision highp float;out vec4 result;void main(){result=vec4(0);}`);this.meshFaces=this.texture(1,1);this.meshLinks=this.texture(1,1);this.meshEdges=this.texture(1,1);this.ringStrength=0;this.ringCount=0;this.ringRadius=2;this.ringSpeed=0;this.compute=this.program(quad,integrate);this.render=this.program(points,glow);this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
 this.states=Array.from({length:3},()=>{const p=this.texture(WIDTH,HEIGHT),v=this.texture(WIDTH,HEIGHT),f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,p,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,v,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('GPU simulation framebuffer is incomplete.');return {p,v,f};});
 this.bodyStyle=this.texture(WIDTH,HEIGHT);this.destinations=this.texture(WIDTH,HEIGHT);this.history=this.texture(WIDTH,HEIGHT*HISTORY);this.current=0;this.head=0;this.filled=0;this.count=0;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 program(vs,fs){const g=this.gl,p=g.createProgram();for(const [type,source] of [[g.VERTEX_SHADER,vs],[g.FRAGMENT_SHADER,fs]]){const s=g.createShader(type);g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));g.attachShader(p,s);g.deleteShader(s);}g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));return p;}
 texture(w,h){const g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texImage2D(g.TEXTURE_2D,0,g.RGBA32F,w,h,0,g.RGBA,g.FLOAT,null);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);return t;}
 bind(program,name,t,unit){const g=this.gl;g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,t);g.uniform1i(g.getUniformLocation(program,name),unit);}
 reset(p,v,count,ring=false,mesh=null){this.setMesh(mesh);this.ringCount=ring?count:0;this.ringRadius=ring?Math.hypot(p[4]-p[0],p[6]-p[2]):2;this.ringSpeed=ring?Math.hypot(v[4]-v[0],v[6]-v[2]):0;const g=this.gl;g.bindTexture(g.TEXTURE_2D,this.bodyStyle);g.texSubImage2D(g.TEXTURE_2D,0,0,0,WIDTH,HEIGHT,g.RGBA,g.FLOAT,mesh?.bodyStyle||new Float32Array(CAPACITY*4));this.count=count;this.current=0;this.head=0;this.filled=0;for(const s of this.states){for(const [t,data] of [[s.p,p],[s.v,v]]){g.bindTexture(g.TEXTURE_2D,t);g.texSubImage2D(g.TEXTURE_2D,0,0,0,WIDTH,HEIGHT,g.RGBA,g.FLOAT,data);}}this.record();}
 setMesh(mesh){const g=this.gl;this.meshScale=mesh?mesh.stiffnessScale||1:1;this.meshPointScale=mesh?mesh.pointScale||1:1;this.meshHiddenSurface=!!mesh?.hiddenSurface;this.meshFaceCount=this.meshHiddenSurface?mesh.faces.length:0;this.meshCount=mesh?mesh.count:0;this.meshSlots=mesh?mesh.slots:0;this.meshEdgeCount=mesh?mesh.edges.length:0;
 const faceData=new Float32Array(this.meshFaceCount?256*Math.ceil(this.meshFaceCount/256)*4:4);if(this.meshFaceCount)mesh.faces.forEach((face,i)=>faceData.set([...face,1],i*4));g.bindTexture(g.TEXTURE_2D,this.meshFaces);g.texImage2D(g.TEXTURE_2D,0,g.RGBA32F,this.meshFaceCount?256:1,this.meshFaceCount?Math.ceil(this.meshFaceCount/256):1,0,g.RGBA,g.FLOAT,faceData);
 for(const [texture,w,h,data] of [[this.meshLinks,mesh?mesh.slots:1,mesh?mesh.count:1,mesh?mesh.links:null],[this.meshEdges,mesh?256:1,mesh?Math.ceil(mesh.edges.length/256):1,mesh?mesh.edgeData:null]]){g.bindTexture(g.TEXTURE_2D,texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA32F,w,h,0,g.RGBA,g.FLOAT,data);}
 }
 step(dt){if(!this.count)return;const g=this.gl;g.disable(g.BLEND);g.disable(g.DEPTH_TEST);g.viewport(0,0,WIDTH,HEIGHT);g.useProgram(this.compute);for(let phase=0;phase<2;phase++){const src=this.states[this.current],idx=(this.current+1)%3,dst=this.states[idx];g.bindFramebuffer(g.FRAMEBUFFER,dst.f);g.drawBuffers([g.COLOR_ATTACHMENT0,g.COLOR_ATTACHMENT1]);this.bind(this.compute,'positions',src.p,0);this.bind(this.compute,'velocities',src.v,1);this.bind(this.compute,'destinations',this.destinations,2);this.bind(this.compute,'meshLinks',this.meshLinks,3);g.uniform1i(g.getUniformLocation(this.compute,'meshCount'),this.meshCount);g.uniform1i(g.getUniformLocation(this.compute,'meshSlots'),this.meshSlots);for(const name of ['meshStiffness','meshBending','meshDamping','meshScale'])g.uniform1f(g.getUniformLocation(this.compute,name),this[name]);g.uniform1i(g.getUniformLocation(this.compute,'count'),this.count);g.uniform1i(g.getUniformLocation(this.compute,'phase'),phase);g.uniform1f(g.getUniformLocation(this.compute,'dt'),dt);g.uniform1f(g.getUniformLocation(this.compute,'softening'),.08);g.uniform1f(g.getUniformLocation(this.compute,'massScale'),this.massScale);g.uniform1i(g.getUniformLocation(this.compute,'ringCount'),this.ringCount);g.uniform1f(g.getUniformLocation(this.compute,'ringStrength'),this.ringStrength);g.uniform1f(g.getUniformLocation(this.compute,'ringRadius'),this.ringRadius);g.uniform1f(g.getUniformLocation(this.compute,'ringSpeed'),this.ringSpeed*Math.sqrt(this.massScale));g.drawArrays(g.TRIANGLES,0,3);this.current=idx;}}
 record(){const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,this.states[this.current].f);g.readBuffer(g.COLOR_ATTACHMENT0);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.history);g.copyTexSubImage2D(g.TEXTURE_2D,0,0,this.head*HEIGHT,0,0,WIDTH,HEIGHT);this.head=(this.head+1)%HISTORY;this.filled=Math.min(HISTORY,this.filled+1);}
 add(p,v,target=null,style=null){if(this.count>=CAPACITY)return false;const g=this.gl,i=this.count;for(const s of this.states){for(const [t,data] of [[s.p,p],[s.v,v]]){g.bindTexture(g.TEXTURE_2D,t);g.texSubImage2D(g.TEXTURE_2D,0,i%WIDTH,Math.floor(i/WIDTH),1,1,g.RGBA,g.FLOAT,new Float32Array(data));}}g.bindTexture(g.TEXTURE_2D,this.destinations);g.texSubImage2D(g.TEXTURE_2D,0,i%WIDTH,Math.floor(i/WIDTH),1,1,g.RGBA,g.FLOAT,new Float32Array(target?[...target,1]:[0,0,0,0]));g.bindTexture(g.TEXTURE_2D,this.bodyStyle);g.texSubImage2D(g.TEXTURE_2D,0,i%WIDTH,Math.floor(i/WIDTH),1,1,g.RGBA,g.FLOAT,new Float32Array(style||[0,0,0,0]));this.count++;return true;}
 resizeDisplay(w,h){const g=this.gl;if(this.displayWidth===w&&this.displayHeight===h)return;
 if(!this.accumulation){this.accumulation=g.createTexture();this.displayFramebuffer=g.createFramebuffer();this.displayDepth=g.createRenderbuffer();}
 g.bindTexture(g.TEXTURE_2D,this.accumulation);g.texImage2D(g.TEXTURE_2D,0,g.RGBA16F,w,h,0,g.RGBA,g.HALF_FLOAT,null);
 g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);
 g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
 g.bindFramebuffer(g.FRAMEBUFFER,this.displayFramebuffer);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,this.accumulation,0);g.drawBuffers([g.COLOR_ATTACHMENT0]);g.bindRenderbuffer(g.RENDERBUFFER,this.displayDepth);g.renderbufferStorage(g.RENDERBUFFER,g.DEPTH_COMPONENT24,w,h);g.framebufferRenderbuffer(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.RENDERBUFFER,this.displayDepth);
 if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('GPU color framebuffer is incomplete.');
 this.displayWidth=w;this.displayHeight=h;
 }
 draw(camera,trails){const g=this.gl,dpr=Math.min(devicePixelRatio||1,2),w=Math.round(this.canvas.clientWidth*dpr),h=Math.round(this.canvas.clientHeight*dpr);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.resizeDisplay(w,h);g.bindFramebuffer(g.FRAMEBUFFER,this.displayFramebuffer);g.viewport(0,0,w,h);g.clearColor(0,0,0,0);g.disable(g.DEPTH_TEST);g.depthMask(true);g.clear(g.COLOR_BUFFER_BIT|(this.meshHiddenSurface?g.DEPTH_BUFFER_BIT:0));if(this.meshHiddenSurface){this.drawSurface(camera,w/h);g.depthMask(false);}g.useProgram(this.render);for(const [name,off] of [['right',0],['up',3],['back',6],['eye',9]])g.uniform3fv(g.getUniformLocation(this.render,name),camera.subarray(off,off+3));g.uniform1f(g.getUniformLocation(this.render,'aspect'),w/h);g.uniform1f(g.getUniformLocation(this.render,'pixelRatio'),dpr);g.uniform1f(g.getUniformLocation(this.render,'blobSize'),this.blobSize);g.uniform1f(g.getUniformLocation(this.render,'zoomScale'),this.zoomScale);g.uniform1f(g.getUniformLocation(this.render,'maxPointSize'),this.maxPointSize);g.uniform1i(g.getUniformLocation(this.render,'meshCount'),this.meshCount);g.uniform1f(g.getUniformLocation(this.render,'meshPointScale'),this.meshPointScale);g.uniform1i(g.getUniformLocation(this.render,'count'),this.count);g.uniform1i(g.getUniformLocation(this.render,'head'),this.head);g.uniform1i(g.getUniformLocation(this.render,'filled'),this.filled);this.bind(this.render,'positions',this.states[this.current].p,0);this.bind(this.render,'history',this.history,1);this.bind(this.render,'bodyStyle',this.bodyStyle,2);g.enable(g.BLEND);g.blendFunc(g.ONE,g.ONE);if(trails){g.uniform1i(g.getUniformLocation(this.render,'trail'),1);g.drawArrays(g.POINTS,0,this.count*this.filled);}g.uniform1i(g.getUniformLocation(this.render,'trail'),0);g.drawArrays(g.POINTS,0,this.count);if(this.meshEdgeCount){g.useProgram(this.edgeRender);for(const [name,off] of [['right',0],['up',3],['back',6],['eye',9]])g.uniform3fv(g.getUniformLocation(this.edgeRender,name),camera.subarray(off,off+3));g.uniform1f(g.getUniformLocation(this.edgeRender,'aspect'),w/h);g.uniform1f(g.getUniformLocation(this.edgeRender,'zoomScale'),this.zoomScale);this.bind(this.edgeRender,'positions',this.states[this.current].p,0);this.bind(this.edgeRender,'meshEdges',this.meshEdges,1);g.drawArrays(g.LINES,0,this.meshEdgeCount*2);}g.disable(g.BLEND);g.disable(g.DEPTH_TEST);g.depthMask(true);g.bindFramebuffer(g.FRAMEBUFFER,null);g.useProgram(this.composite);this.bind(this.composite,'accumulation',this.accumulation,0);g.uniform3fv(g.getUniformLocation(this.composite,'overlapColor'),this.overlapColor);g.drawArrays(g.TRIANGLES,0,3);}
 // Hidden-line portrait: front surfaces mask rear wire and cloud particles.
 drawSurface(camera,aspect){const g=this.gl,p=this.surfaceRender;g.useProgram(p);g.enable(g.DEPTH_TEST);g.depthFunc(g.LEQUAL);g.disable(g.BLEND);g.colorMask(false,false,false,false);g.enable(g.POLYGON_OFFSET_FILL);g.polygonOffset(1,1);
 for(const [name,off] of [['right',0],['up',3],['back',6],['eye',9]])g.uniform3fv(g.getUniformLocation(p,name),camera.subarray(off,off+3));g.uniform1f(g.getUniformLocation(p,'aspect'),aspect);g.uniform1f(g.getUniformLocation(p,'zoomScale'),this.zoomScale);this.bind(p,'positions',this.states[this.current].p,0);this.bind(p,'meshFaces',this.meshFaces,1);g.drawArrays(g.TRIANGLES,0,this.meshFaceCount*3);g.disable(g.POLYGON_OFFSET_FILL);g.colorMask(true,true,true,true);
 }
 // Only the followed particle is read back for camera tracking (8 floats).
 particle(id){const g=this.gl,s=this.states[this.current],p=new Float32Array(4),v=new Float32Array(4);g.bindFramebuffer(g.FRAMEBUFFER,s.f);g.readBuffer(g.COLOR_ATTACHMENT0);g.readPixels(id%WIDTH,Math.floor(id/WIDTH),1,1,g.RGBA,g.FLOAT,p);g.readBuffer(g.COLOR_ATTACHMENT1);g.readPixels(id%WIDTH,Math.floor(id/WIDTH),1,1,g.RGBA,g.FLOAT,v);return {p,v};}
 // Diagnostic readback is used only by verification, never by the animation loop.
 snapshot(){const g=this.gl,s=this.states[this.current],p=new Float32Array(CAPACITY*4),v=new Float32Array(CAPACITY*4);g.bindFramebuffer(g.FRAMEBUFFER,s.f);g.readBuffer(g.COLOR_ATTACHMENT0);g.readPixels(0,0,WIDTH,HEIGHT,g.RGBA,g.FLOAT,p);g.readBuffer(g.COLOR_ATTACHMENT1);g.readPixels(0,0,WIDTH,HEIGHT,g.RGBA,g.FLOAT,v);return {p:Array.from(p.slice(0,this.count*4)),v:Array.from(v.slice(0,this.count*4))};}
}
