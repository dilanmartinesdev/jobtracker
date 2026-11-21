# Included from every location in nginx.conf (add_header in a location replaces the ones above it).
#
# The CSP allows only our own scripts, styles, fonts and API: no inline script and no third-party
# origins. That limits what an XSS bug could do, including reading the token from localStorage and
# sending it elsewhere. style-src-attr allows the style="" attributes React sets for the bar widths,
# while style-src still forbids injected <style> blocks and external stylesheets.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
