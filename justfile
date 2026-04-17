# Local static server for PWA testing. Requires Python 3.
# Override port: PORT=9000 just serve

serve:
    python3 -m http.server "${PORT:-8766}"

default: serve
