.EXPORT_ALL_VARIABLES: ;

serve: ; @nix-shell --keep HUGO_ENV --pure --run \
	'hugo server --bind 0.0.0.0 --port 1313 -D --navigateToChanged'
.PHONY: serve
