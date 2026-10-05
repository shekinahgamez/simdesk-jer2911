"""Run before zipping: tags every local .js/.css in index.html with ?v=<build> so browsers fetch fresh files after an update,
and records the build number that Settings shows."""
import re, datetime
b = datetime.datetime.now().strftime("%Y.%m.%d-%H%M")
h = open("index.html").read()
h = re.sub(r'((?:src|href)="(?:assets|sites|desktop|data)/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"', lambda m: f'{m.group(1)}?v={b}"', h)
h = re.sub(r'<script>window\.SIMDESK_BUILD="[^"]*";</script>\n?', "", h)
h = h.replace("<head>", f'<head>\n<script>window.SIMDESK_BUILD="{b}";</script>', 1)
open("index.html", "w").write(h)
print("build", b, "| tagged files:", len(re.findall(r'\?v=' + re.escape(b), h)))
