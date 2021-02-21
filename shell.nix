let
  sources = import ./nix/sources.nix;
  pkgs = import sources.nixpkgs { };
  pkgs-diagrams = import sources.nixpkgs-diagrams { };
in with pkgs;
mkShell {
  buildInputs = [
    gnumake
    bashInteractive
    hugo
    nodejs
    python3Packages.python-language-server
    python3Packages.graphviz
    pkgs-diagrams.python3Packages.diagrams
  ];
  shellHook = ''
    export PATH="$PATH:$PWD/node_modules/.bin"
  '';
}
