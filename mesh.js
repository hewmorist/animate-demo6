// A subdivided icosahedron: shared vertices, edge springs and opposite-facet braces.
// Braces approximate bending resistance using distances, rather than dihedral angles.
export function wireSphere(capacity=2048){
 const t=(1+Math.sqrt(5))/2,normalize=p=>{const r=Math.hypot(...p);return p.map(x=>2*x/r);};
 const vertices=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(normalize);
 const base=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]],cache=new Map(),key=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
 const midpoint=(a,b)=>{const k=key(a,b);if(!cache.has(k)){cache.set(k,vertices.length);vertices.push(normalize(vertices[a].map((x,i)=>(x+vertices[b][i])/2)));}return cache.get(k);};
 const faces=base.flatMap(([a,b,c])=>{const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);return [[a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]];});
 return buildMesh(vertices,faces,capacity);
}

export function buildMesh(vertices,faces,capacity,internalPairs=[]){
 if(vertices.length>capacity)throw Error('Mesh exceeds body capacity.');
 const key=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
 const shared=new Map();for(const [a,b,c] of faces)for(const [u,v,opposite] of [[a,b,c],[b,c,a],[c,a,b]]){const k=key(u,v);if(!shared.has(k))shared.set(k,{a:Math.min(u,v),b:Math.max(u,v),opposite:[]});shared.get(k).opposite.push(opposite);}
 const edges=[...shared.values()].map(e=>[e.a,e.b]);
 const edgeKeys=new Set(edges.map(e=>key(...e))),candidates=[...new Map([...shared.values()].filter(e=>e.opposite.length===2).map(e=>[key(...e.opposite),e.opposite])).values()].filter(e=>!edgeKeys.has(key(...e)));
 const struts=[...new Map(internalPairs.map(e=>[key(...e),e])).values()].filter(e=>!edgeKeys.has(key(...e)));
 const strutKeys=new Set(struts.map(e=>key(...e))),degrees=vertices.map(()=>0);for(const [a,b] of [...edges,...struts]){degrees[a]++;degrees[b]++;}
 const braces=[...struts];for(const [a,b] of candidates)if(!strutKeys.has(key(a,b))&&degrees[a]<24&&degrees[b]<24){braces.push([a,b]);degrees[a]++;degrees[b]++;}

 const neighbors=vertices.map(()=>[]);for(const [type,pairs] of [[0,edges],[1,braces]])for(const [a,b] of pairs){const rest=Math.hypot(...vertices[a].map((x,i)=>x-vertices[b][i]));neighbors[a].push([b,rest,type,1]);neighbors[b].push([a,rest,type,1]);}
 const slots=Math.max(...neighbors.map(n=>n.length));if(slots>24)throw Error('Mesh exceeds GPU link capacity.');const links=new Float32Array(slots*vertices.length*4),edgeData=new Float32Array(256*Math.ceil(edges.length/256)*4),p=new Float32Array(capacity*4),v=new Float32Array(capacity*4);
 vertices.forEach((xyz,i)=>{p.set([...xyz,1/vertices.length],i*4);neighbors[i].forEach((link,j)=>links.set(link,(i*slots+j)*4));});edges.forEach((e,i)=>edgeData.set([...e,0,1],i*4));
 return {p,v,count:vertices.length,faces,edges,braces,slots,links,edgeData};
}

// Anatomical ring grids: visible rectangular cells, hidden diagonal supports.
// Separate closed anatomical patches are joined by internal elastic struts.
export function wireBeing(capacity=2048,seed=12345,inert=false){
 const vertices=[],faces=[],quads=[],visible=new Map(),key=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
 const edge=(a,b)=>visible.set(key(a,b),[a,b]);
 const tube=(profile,rows,around)=>{
  if(inert){if(profile[0][1]===2.28)profile=[[0,2.34,0,.005,.005],...profile];rows=rows*2-1;around*=2;}
  const start=vertices.length;
  for(let r=0;r<rows;r++){
   const t=r/(rows-1)*(profile.length-1),lo=Math.min(profile.length-2,Math.floor(t)),f=t-lo;
   const [x,y,z,rx,rz]=profile[lo].map((v,k)=>{if(!inert)return v+(profile[lo+1][k]-v)*f;const a=profile[Math.max(0,lo-1)][k],b=v,c=profile[lo+1][k],d=profile[Math.min(profile.length-1,lo+2)][k];return .5*(2*b+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f);});
   const before=profile[Math.max(0,lo-1)],after=profile[Math.min(profile.length-1,lo+1)],dx=after[0]-before[0],dy=after[1]-before[1],length=Math.hypot(dx,dy)||1;
   for(let j=0;j<around;j++){const angle=j*2*Math.PI/around,u=Math.sin(angle)*rx;vertices.push([x+u*Math.abs(dy)/length,y-u*dx*Math.sign(dy||1)/length,z+Math.cos(angle)*rz]);}
  }
  for(let r=0;r<rows-1;r++)for(let j=0;j<around;j++){
   const a=start+r*around+j,b=start+r*around+(j+1)%around,c=b+around,d=a+around;
   quads.push([a,b,c,d]);faces.push([a,b,d],[b,c,d]);for(const [u,v] of [[a,b],[b,c],[c,d],[d,a]])edge(u,v);
  }
  // Small end caps: fan supports remain invisible, including their diagonals.
  for(const r of [0,rows-1]){const ring=start+r*around,pole=vertices.length,center=[0,1,2].map(k=>vertices.slice(ring,ring+around).reduce((sum,p)=>sum+p[k],0)/around);vertices.push(center);for(let j=0;j<around;j++)faces.push([pole,ring+j,ring+(j+1)%around]);}
 };
 // Copy the portrait's neck/trapezius/chest profile at full-body scale.
 // A narrow hidden arm root and a fuller deltoid remove the squared end cap.
 const shoulderScale=.64,shoulderY=1.48;
 tube([[0,shoulderY-.08*shoulderScale,0,.24*shoulderScale,.21*shoulderScale],[0,shoulderY-.28*shoulderScale,0,.67*shoulderScale,.27*shoulderScale],[0,shoulderY-.48*shoulderScale,0,.78*shoulderScale,.35*shoulderScale],[0,1.02,0,.51,.29],[0,.70,0,.41,.25],[0,.43,0,.37,.24],[0,.17,0,.43,.26],[0,-.10,0,.36,.24]],20,20);
 tube([[0,2.28,0,.14,.14],[0,2.20,0,.23,.23],[0,2.06,.015,.28,.265],[0,1.91,.025,.27,.255],[0,1.77,.025,.235,.22],[0,1.65,.01,.18,.17],[0,1.38,0,.14,.145]],14,20);
 for(const sign of [-1,1]){
  const profile=rows=>rows.map(([x,y,z,rx,rz])=>[sign*x,y,z,rx,rz]);
  tube(profile([[.61*shoulderScale,shoulderY-.36*shoulderScale,0,.10*shoulderScale,.12*shoulderScale],[.83*shoulderScale,shoulderY-.47*shoulderScale,0,.225*shoulderScale,.245*shoulderScale],[1.01*shoulderScale,shoulderY-.80*shoulderScale,0,.19*shoulderScale,.21*shoulderScale],[.78,.66,0,.12,.13],[.85,.54,0,.105,.11],[1.02,.21,.02,.115,.12],[1.18,-.12,.025,.070,.075],[1.24,-.26,.04,.095,.065],[1.31,-.43,.04,.065,.05]]),16,12);
  tube(profile([[.25,.05,0,.20,.22],[.26,-.25,0,.23,.24],[.27,-.62,.025,.18,.20],[.27,-.94,.04,.14,.15],[.28,-1.20,.015,.16,.18],[.29,-1.53,0,.12,.13],[.30,-1.85,0,.08,.09],[.30,-1.98,.12,.13,.23],[.30,-2.07,.17,.105,.21]]),18,16);
 }
 if(inert)for(const sign of [-1,1])for(let finger=0;finger<5;finger++){const x=1.29+(finger-2)*.023,y=-.37+(finger===0?.055:0),length=finger===0?.13:.19-Math.abs(finger-2)*.025;tube([[sign*x,y,.055,.026,.024],[sign*(x+.025),y-length*.5,.065,.023,.021],[sign*(x+.045),y-length,.065,.013,.014]],5,8);}
 const center=[0,1,2].map(k=>vertices.reduce((sum,p)=>sum+p[k],0)/vertices.length);for(const p of vertices)for(let k=0;k<3;k++)p[k]-=center[k];
 if(inert)return {vertices,faces,edges:[...visible.values()],quads};
 const struts=[];for(let i=0;i<vertices.length;i++)for(const offset of [431,677])struts.push([i,(i+offset)%vertices.length]);
 const mesh=buildMesh(vertices,faces,capacity,struts);
 // Physics retains diagonal and cross-body supports; only quad borders draw.
 mesh.edges=[...visible.values()];mesh.edgeData=new Float32Array(256*Math.ceil(mesh.edges.length/256)*4);mesh.edges.forEach((e,i)=>mesh.edgeData.set([...e,0,1],i*4));mesh.quads=quads;
 mesh.stiffnessScale=32;mesh.hiddenSurface=true;mesh.pointScale=.55;
 // Match the portrait's two sixfold bright-blue eye nodes on the smaller head.
 mesh.bodyStyle=new Float32Array(capacity*4);mesh.eyeNodes=[];
 for(const sign of [-1,1]){
  let nearest=-1,best=Infinity;
  for(let i=0;i<vertices.length;i++){const p=vertices[i].map((x,k)=>x+center[k]);if(sign*p[0]<=0||p[1]<1.8||p[2]<.08)continue;const error=(p[0]-sign*.13)**2+(p[1]-2.04)**2;if(error<best){best=error;nearest=i;}}
  mesh.eyeNodes.push(nearest);mesh.bodyStyle.set([.015,.24,1,6],nearest*4);
 }
 const cloud=204,total=mesh.count+cloud;if(total>capacity)throw Error('Humanoid cloud exceeds body capacity.');
 for(let i=0;i<mesh.count;i++){mesh.p[i*4+3]=.9/mesh.count;mesh.v[i*4]=.12*mesh.p[i*4+2];mesh.v[i*4+2]=-.12*mesh.p[i*4];}
 let randomState=seed>>>0;const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 for(let i=0;i<cloud;i+=2){const y=2*random()-1,a=2*Math.PI*random(),r=2.65+1.6*random(),h=Math.sqrt(1-y*y),point=[r*h*Math.sin(a),r*y,r*h*Math.cos(a)],axis=[random()-.5,random()-.5,random()-.5];let tangent=[axis[1]*point[2]-axis[2]*point[1],axis[2]*point[0]-axis[0]*point[2],axis[0]*point[1]-axis[1]*point[0]];if(Math.hypot(...tangent)<1e-8)tangent=[point[2],0,-point[0]];const factor=Math.sqrt(.9/r)/Math.hypot(...tangent);
  for(let k=0;k<2;k++){const sign=k===0?1:-1,id=mesh.count+i+k;mesh.p.set([...point.map(x=>sign*x),.1/cloud],id*4);mesh.v.set([...tangent.map(x=>sign*x*factor),1],id*4);}
 }
 mesh.totalCount=total;return mesh;
}

// A facially detailed, closed portrait shell with an independent particle cloud.
export function wireBust(capacity=2048,seed=12345){
 // A compact rounded head and neck, plus distinct chest/deltoid/upper-arm patches.
 const rings=[
  [1.30,.20,.20],[1.22,.33,.29],[1.10,.40,.35],[.97,.43,.37],
  [.84,.44,.37],[.72,.43,.35],[.60,.41,.32],[.49,.39,.30],
  [.39,.36,.28],[.30,.33,.25],[.22,.27,.22],[.14,.205,.20],
  [.04,.205,.20],[-.09,.23,.215]
 ];
 const around=36,vertices=[],faces=[],quads=[];
 const bump=(x,y,cx,cy,sx,sy,h)=>h*Math.exp(-.5*(((x-cx)/sx)**2+((y-cy)/sy)**2));
 for(const [y,rx,rz] of rings)for(let j=0;j<around;j++){
  const a=j*2*Math.PI/around,s=Math.sin(a),c=Math.cos(a);let x=rx*Math.sign(s)*Math.abs(s)**.88,z=rz*c;
  if(y>.20){let detail=bump(x,y,0,.77,.085,.16,.045)+bump(x,y,0,.64,.115,.095,.070);
   for(const sign of [-1,1])detail+=bump(x,y,sign*.19,.91,.14,.05,.045)+bump(x,y,sign*.19,.82,.11,.060,-.060)+bump(x,y,sign*.27,.65,.13,.13,.040);
   detail+=bump(x,y,0,.47,.18,.035,.040)+bump(x,y,0,.39,.17,.035,.045)+bump(x,y,0,.43,.17,.021,-.025)+bump(x,y,0,.28,.17,.075,.025);
   z+=detail*Math.max(0,c)**4;
   x+=Math.sign(s)*.035*Math.exp(-.5*((y-.77)/.15)**2)*Math.abs(s)**12;
  }
  vertices.push([x,y,z]);
 }
 const grid=(start,rows,around)=>{for(let r=0;r<rows-1;r++)for(let j=0;j<around;j++){const a=start+r*around+j,b=start+r*around+(j+1)%around,c=a+around,d=b+around;quads.push([a,b,d,c]);faces.push([a,c,b],[b,c,d]);}};
 grid(0,rings.length,around);
 // Hidden caps leave the visible skull grid rectangular.
 for(const [outer,y,rx,rz,poleY] of [[0,1.345,.085,.085,1.36],[(rings.length-1)*around,-.09,.115,.1075,-.09]]){
  const inner=vertices.length;for(let j=0;j<12;j++){const a=j*2*Math.PI/12;vertices.push([rx*Math.sin(a),y,rz*Math.cos(a)]);}
  const pole=vertices.length;vertices.push([0,poleY,0]);
  for(let j=0;j<12;j++){const a=outer+3*j,b=outer+(3*j+1)%around,c=outer+(3*j+2)%around,d=outer+(3*j+3)%around,u=inner+j,v=inner+(j+1)%12;faces.push([a,b,u],[b,c,u],[c,v,u],[c,d,v],[pole,u,v]);}
 }
 const tube=(profile,rows,around,chest=false)=>{
  const start=vertices.length;
  for(let r=0;r<rows;r++){
   const t=r/(rows-1)*(profile.length-1),lo=Math.min(profile.length-2,Math.floor(t)),f=t-lo,[x,y,z,rx,rz]=profile[lo].map((v,k)=>v+(profile[lo+1][k]-v)*f),before=profile[Math.max(0,lo-1)],after=profile[Math.min(profile.length-1,lo+1)],dx=after[0]-before[0],dy=after[1]-before[1],length=Math.hypot(dx,dy)||1;
   for(let j=0;j<around;j++){const a=j*2*Math.PI/around,u=Math.sin(a)*rx;let px=x+u*Math.abs(dy)/length,py=y-u*dx*Math.sign(dy||1)/length,pz=z+Math.cos(a)*rz;
    if(chest)for(const sign of [-1,1])pz+=(bump(px,py,sign*.33,-.60,.28,.24,.075)+bump(px,py,sign*.31,-.29,.27,.05,.025))*Math.max(0,Math.cos(a))**3;
    vertices.push([px,py,pz]);
   }
  }
  grid(start,rows,around);
  for(const r of [0,rows-1]){const ring=start+r*around,pole=vertices.length,center=[0,1,2].map(k=>vertices.slice(ring,ring+around).reduce((sum,p)=>sum+p[k],0)/around);vertices.push(center);for(let j=0;j<around;j++)faces.push([pole,ring+j,ring+(j+1)%around]);}
 };
 tube([[0,-.08,0,.24,.21],[0,-.28,0,.67,.27],[0,-.48,0,.78,.35],[0,-.78,0,.72,.38],[0,-1.40,0,.61,.32]],9,20,true);
 for(const sign of [-1,1])tube([[sign*.61,-.36,0,.10,.12],[sign*.83,-.47,0,.225,.245],[sign*1.01,-.80,0,.19,.21],[sign*1.12,-1.36,0,.135,.15]],7,10);
 const center=[0,1,2].map(k=>vertices.reduce((sum,p)=>sum+p[k],0)/vertices.length);for(const p of vertices)for(let k=0;k<3;k++)p[k]-=center[k];
 const struts=[];for(let i=0;i<vertices.length;i++)for(const offset of [221,337])struts.push([i,(i+offset)%vertices.length]);
 const mesh=buildMesh(vertices,faces,capacity,struts);mesh.stiffnessScale=32;mesh.hiddenSurface=true;mesh.pointScale=.55;
 // Rectangular latitude/longitude cells follow the sculpted face and shoulders.
 // Hidden cap triangles and diagonal supports remain in the physical mesh.
 const borders=new Map(),key=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
 for(const q of quads)for(let j=0;j<4;j++){const a=q[j],b=q[(j+1)%4];borders.set(key(a,b),[a,b]);}
 mesh.quads=quads;mesh.edges=[...borders.values()];mesh.edgeData=new Float32Array(256*Math.ceil(mesh.edges.length/256)*4);mesh.edges.forEach((e,i)=>mesh.edgeData.set([...e,0,1],i*4));

 // Two existing front-facing nodes become large saturated-blue eyes.
 // Style is attached to body IDs, so it follows deformation and physical motion.
 mesh.bodyStyle=new Float32Array(capacity*4);mesh.eyeNodes=[];
 for(const sign of [-1,1]){
  let nearest=-1,best=Infinity;
  for(let i=0;i<rings.length*around;i++){const p=vertices[i].map((x,k)=>x+center[k]);if(sign*p[0]<=0||p[2]<.1)continue;const error=(p[0]-sign*.19)**2+(p[1]-.82)**2;if(error<best){best=error;nearest=i;}}
  mesh.eyeNodes.push(nearest);mesh.bodyStyle.set([.015,.24,1,6],nearest*4);
 }
 // Accent the geometric eye rims, nose bridge and lips in the visible wire.
 const raw=id=>vertices[id].map((x,k)=>x+center[k]);
 mesh.edges.forEach(([a,b],i)=>{const A=raw(a),B=raw(b);if(A[2]<.1||B[2]<.1)return;let tag=0;
  if(A[1]>=.72&&A[1]<=.97&&B[1]>=.72&&B[1]<=.97&&A[0]*B[0]>0&&[A,B].every(p=>Math.abs(p[0])>=.07&&Math.abs(p[0])<=.31))tag=1;
  else if([A,B].every(p=>p[1]>=.30&&p[1]<=.50&&Math.abs(p[0])<.22))tag=2;
  else if([A,B].every(p=>p[1]>=.50&&p[1]<=.90&&Math.abs(p[0])<.085))tag=3;
  mesh.edgeData[i*4+2]=tag;
 });
 const total=1024,cloud=total-mesh.count;if(total>capacity)throw Error('Portrait cloud exceeds body capacity.');
 // Opposite random pairs keep total centre of mass and momentum at the origin.
 let randomState=seed>>>0;const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 for(let i=0;i<mesh.count;i++){mesh.p[i*4+3]=.9/mesh.count;mesh.v[i*4]=.08*mesh.p[i*4+2];mesh.v[i*4+2]=-.08*mesh.p[i*4];}
 for(let i=0;i<cloud;i+=2){const y=2*random()-1,a=2*Math.PI*random(),r=2.1+1.5*random(),h=Math.sqrt(1-y*y),point=[r*h*Math.sin(a),r*y,r*h*Math.cos(a)],axis=[random()-.5,random()-.5,random()-.5];
  let tangent=[axis[1]*point[2]-axis[2]*point[1],axis[2]*point[0]-axis[0]*point[2],axis[0]*point[1]-axis[1]*point[0]];if(Math.hypot(...tangent)<1e-8)tangent=[point[2],0,-point[0]];
  const factor=Math.sqrt(.9/r)/Math.hypot(...tangent),velocity=tangent.map(x=>x*factor);
  for(let k=0;k<2;k++){const sign=k===0?1:-1,id=mesh.count+i+k;mesh.p.set([...point.map(x=>sign*x),.1/cloud],id*4);mesh.v.set([...velocity.map(x=>sign*x),1],id*4);}
 }
 mesh.totalCount=total;return mesh;
}

// The original triangulated shell, surrounded by an independent random field.
export function wireCell(capacity=2048,seed=12345,total=256){
 const mesh=wireSphere(capacity),cloud=total-mesh.count;
 if(cloud<2||cloud%2)throw Error('Cell model needs an even total and at least two cloud bodies.');
 if(total>capacity)throw Error('Cell model exceeds body capacity.');
 for(let i=0;i<mesh.count;i++)mesh.p[i*4+3]=.9/mesh.count;
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=0;i<cloud;i+=2){
  const y=2*random()-1,a=2*Math.PI*random(),r=2.65+1.6*random(),h=Math.sqrt(1-y*y),point=[r*h*Math.sin(a),r*y,r*h*Math.cos(a)],axis=[random()-.5,random()-.5,random()-.5];
  let tangent=[axis[1]*point[2]-axis[2]*point[1],axis[2]*point[0]-axis[0]*point[2],axis[0]*point[1]-axis[1]*point[0]];
  if(Math.hypot(...tangent)<1e-8)tangent=[point[2],0,-point[0]];
  const scale=Math.sqrt(.9/r)/Math.hypot(...tangent);
  for(let k=0;k<2;k++){const sign=k===0?1:-1,id=mesh.count+i+k;mesh.p.set([...point.map(x=>sign*x),.1/cloud],id*4);mesh.v.set([...tangent.map(x=>sign*x*scale),1],id*4);}
 }
 mesh.totalCount=total;return mesh;
}

// Add a gravity-only cloud around an existing central-mass ring arrangement.
export function ringCloud(positions,velocities,coreCount,total=512,seed=12345){
 if(total>positions.length/4||total<coreCount||(total-coreCount)%2)throw Error('Invalid ring cloud capacity.');
 const p=positions.slice(),v=velocities.slice(),cloud=total-coreCount;
 for(let i=0;i<coreCount;i++){p[i*4+3]*=.9;for(let k=0;k<3;k++)v[i*4+k]*=Math.sqrt(.9);}
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=0;i<cloud;i+=2){const y=2*random()-1,a=2*Math.PI*random(),r=3.2+1.5*random(),h=Math.sqrt(1-y*y),point=[r*h*Math.sin(a),r*y,r*h*Math.cos(a)],axis=[random()-.5,random()-.5,random()-.5];let tangent=[axis[1]*point[2]-axis[2]*point[1],axis[2]*point[0]-axis[0]*point[2],axis[0]*point[1]-axis[1]*point[0]];if(Math.hypot(...tangent)<1e-8)tangent=[point[2],0,-point[0]];const scale=Math.sqrt(.9/r)/Math.hypot(...tangent);
  for(let k=0;k<2;k++){const sign=k===0?1:-1,id=coreCount+i+k;p.set([...point.map(x=>sign*x),.1/cloud],id*4);v.set([...tangent.map(x=>sign*x*scale),1],id*4);}
 }
 return {p,v,coreCount,totalCount:total};
}

// Free physical particles surrounding the independent inert figure.
export function inertCloud(capacity=2048,total=1024,seed=12345){
 if(total<1||total>capacity)throw Error('Invalid cloud count.');const p=new Float32Array(capacity*4),v=new Float32Array(capacity*4);let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=0;i<total;i+=2){const y=2*random()-1,a=2*Math.PI*random(),r=2.8+1.6*random(),h=Math.sqrt(1-y*y),point=[r*h*Math.sin(a),r*y,r*h*Math.cos(a)],axis=[random()-.5,random()-.5,random()-.5];let tangent=[axis[1]*point[2]-axis[2]*point[1],axis[2]*point[0]-axis[0]*point[2],axis[0]*point[1]-axis[1]*point[0]];const scale=.25/Math.max(1e-8,Math.hypot(...tangent));for(let k=0;k<2&&i+k<total;k++){const sign=k===0?1:-1;p.set([...point.map(x=>sign*x),1/total],(i+k)*4);v.set([...tangent.map(x=>sign*x*scale),1],(i+k)*4);}}
 const mean=[0,1,2].map(k=>{let sum=0;for(let i=0;i<total;i++)sum+=v[i*4+k];return sum/total;});for(let i=0;i<total;i++)for(let k=0;k<3;k++)v[i*4+k]-=mean[k];return {p,v,totalCount:total};
}
