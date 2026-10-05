# Bundles the whole desktop into one HTML file for previewing (not needed for GitHub Pages).
import base64, re
h=open('index.html').read(); r=lambda p:open(p.split('?')[0]).read()
import os
for p in re.findall(r'<link rel="stylesheet" href="([^"]+)">', h):
    css=r(p).replace('url("img/', 'url("'+os.path.dirname(p.split('?')[0])+'/img/')  # CSS urls are relative to the CSS file
    h=h.replace(f'<link rel="stylesheet" href="{p}">','<style>'+css+'</style>')
for p in [x for x in re.findall(r'<script src="([^"]+)"></script>', h) if not x.startswith('http')]:
    h=h.replace(f'<script src="{p}"></script>','<script>'+r(p)+'</script>')
for path,mime in [('sites/blacktea/img/icon.png','png'),('sites/blacktea/img/wordmark.png','png'),('sites/harbor/img/hero.jpg','jpeg'),('sites/porchlight/img/hero.jpg','jpeg'),('assets/icons/favicon.svg','svg+xml'),('assets/icons/apple-touch-icon.png','png'),('sites/permits/img/seal.png','png'),('sites/lotline/img/hero.jpg','jpeg'),('sites/permits/img/icon.png','png'),('sites/permits/img/stamp.png','png')]:
    h=h.replace(path,f'data:image/{mime};base64,'+base64.b64encode(open(path,'rb').read()).decode())
assert 'sites/' not in h
open('/mnt/user-data/outputs/gfb-portal-preview.html','w').write(h)
print('built')
