.EXPORT_ALL_VARIABLES: ;

serve: ; @nix-shell --keep HUGO_ENV --pure --run \
	'hugo server -D --navigateToChanged'
.PHONY: serve
