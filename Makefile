.EXPORT_ALL_VARIABLES: ;

node_modules: ; @npm i
serve: node_modules; @nix develop --ignore-environment --keep HUGO_ENV --command \
	bash -c 'hugo server --bind 127.0.0.1 --port 1313 -D --navigateToChanged'
.PHONY: serve
