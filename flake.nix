{
  description = "martin.baillie.id";
  inputs.nixpkgs.url =
    "github:NixOS/nixpkgs?rev=34ad3ffe08adfca17fcb4e4a47bb5f3b113687be";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = nixpkgs.legacyPackages.${system};
      in with pkgs; {
        devShell = mkShell {
          nativeBuildInputs = [
            gnumake
            bashInteractive
            hugo
            nodejs
            python3Packages.graphviz
            python3Packages.diagrams
          ];
          shellHook = ''
            export PATH="$PATH:$PWD/node_modules/.bin"
          '';
        };
      });
}
