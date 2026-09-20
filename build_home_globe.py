import json,math,random
from pathlib import Path
# Decode the original topology before projecting; do not split rings at the date line.
topology=json.loads(Path('countries-110m.json').read_text())
transform=topology['transform']; arcs=[]
for arc in topology['arcs']:
 x=y=0; points=[]
 for dx,dy in arc:
  x+=dx;y+=dy
  points.append((x*transform['scale'][0]+transform['translate'][0], y*transform['scale'][1]+transform['translate'][1]))
 arcs.append(points)
def decode_ring(indices):
 coords=[]
 for index in indices:
  points=arcs[index] if index>=0 else list(reversed(arcs[~index]))
  coords.extend(points if not coords else points[1:])
 return [v for point in coords for v in point]
data={'geo':[]}
for geometry in topology['objects']['countries']['geometries']:
 polygons=[geometry['arcs']] if geometry['type']=='Polygon' else geometry['arcs']
 data['geo'].append({'rings':[decode_ring(ring) for polygon in polygons for ring in polygon]})

r=315;cx=420;cy=420;lon0=math.radians(93);lat0=math.radians(18)
def project(lon,lat):
 lon=math.radians(lon)-lon0;lat=math.radians(lat)
 return [math.cos(lat)*math.sin(lon), math.cos(lat0)*math.sin(lat)-math.sin(lat0)*math.cos(lat)*math.cos(lon), math.sin(lat0)*math.sin(lat)+math.cos(lat0)*math.cos(lat)*math.cos(lon)]
def coords(p):return f'{cx+r*p[0]:.2f},{cy-r*p[1]:.2f}'
paths=[]
for shape in data['geo']:
 parts=[]
 for ring in shape['rings']:
  points=[project(ring[i],ring[i+1]) for i in range(0,len(ring),2)];out=[]
  for a,b in zip(points[-1:]+points[:-1],points):
   if (a[2]>=0)!=(b[2]>=0):
    t=a[2]/(a[2]-b[2]);p=[a[i]+t*(b[i]-a[i]) for i in range(3)];norm=math.hypot(p[0],p[1]);p[0]/=norm;p[1]/=norm;out.append(p)
   if b[2]>=0:out.append(b)
  if len(out)>2:parts.append('M'+'L'.join(coords(p) for p in out)+'Z')
 if parts:paths.append('<path d="'+''.join(parts)+'"/>')
grid=[]
for axis in ['lat','lon']:
 for a in (range(-60,90,30) if axis=='lat' else range(-180,180,30)):
  pts=[];active=False
  for b in range(-180,181,2) if axis=='lat' else range(-90,91,2):
   p=project(b,a) if axis=='lat' else project(a,b)
   if p[2]>=0:pts.append(('L' if active else 'M')+coords(p));active=True
   else:active=False
  grid.append('<path d="'+''.join(pts)+'"/>')
random.seed(26)
stars=''.join(f'<circle cx="{random.randrange(35,805)}" cy="{random.randrange(35,805)}" r="{random.choice([.6,.8,1])}" opacity="{random.uniform(.12,.5):.2f}"/>' for _ in range(75))
svg='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 840" fill="none">
<defs>
 <radialGradient id="ocean" cx=".28" cy=".22" r=".86"><stop stop-color="#163368"/><stop offset=".5" stop-color="#102753"/><stop offset="1" stop-color="#030a1c"/></radialGradient>
 <radialGradient id="shade" cx=".25" cy=".25" r=".82"><stop offset=".35" stop-color="#030d27" stop-opacity="0"/><stop offset=".85" stop-color="#010515" stop-opacity=".48"/><stop offset="1" stop-color="#010515" stop-opacity=".96"/></radialGradient>
 <radialGradient id="glow"><stop offset=".66" stop-color="#5896ff" stop-opacity="0"/><stop offset=".745" stop-color="#5896ff" stop-opacity=".13"/><stop offset="1" stop-color="#5896ff" stop-opacity="0"/></radialGradient>
 <linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6b91d5"/><stop offset=".65" stop-color="#325794"/><stop offset="1" stop-color="#182c58"/></linearGradient>
 <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#abcfff" stop-opacity=".6"/><stop offset=".48" stop-color="#699cf1" stop-opacity=".25"/><stop offset="1" stop-color="#244d96" stop-opacity="0"/></linearGradient>
 <pattern id="dots" width="4.8" height="4.8" patternUnits="userSpaceOnUse"><circle cx="2.4" cy="2.4" r=".65" fill="#b5d4ff" opacity=".43"/></pattern>
 <clipPath id="sphere"><circle cx="420" cy="420" r="315"/></clipPath>
 <g id="lands">'''+''.join(paths)+'''</g>
</defs>
<g fill="#b9d5ff">'''+stars+'''</g>
<circle cx="420" cy="420" r="420" fill="url(#glow)"/>
<g stroke="#77a1e1" stroke-opacity=".13"><ellipse cx="420" cy="420" rx="400" ry="164" transform="rotate(-27 420 420)"/><circle cx="420" cy="420" r="348" stroke-dasharray="1 11"/><path d="M51 420H71M769 420H789M420 51V71M420 769V789"/></g>
<circle cx="420" cy="420" r="315" fill="url(#ocean)"/>
<g clip-path="url(#sphere)">
 <g stroke="#91baff" stroke-opacity=".095" stroke-width=".65">'''+''.join(grid)+'''</g>
 <use href="#lands" fill="url(#land)" stroke="#93b8f0" stroke-opacity=".2" stroke-width=".45"/>
 <use href="#lands" fill="url(#dots)"/>
 <circle cx="420" cy="420" r="315" fill="url(#shade)"/>
</g>
<circle cx="420" cy="420" r="315.5" stroke="url(#rim)" stroke-width="1.5"/>
<circle cx="420" cy="420" r="319" stroke="url(#rim)" stroke-width=".5" opacity=".25"/>
</svg>'''
Path('assets/earth.svg').write_text(svg)
print('Earth SVG',len(svg),'bytes')
