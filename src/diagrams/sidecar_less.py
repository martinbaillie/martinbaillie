#!/usr/bin/env python3

from diagrams.onprem.security import Vault
from diagrams.onprem.compute import Server
from diagrams.aws.general import GenericSamlToken
from diagrams.k8s.controlplane import CM
from diagrams import Diagram, Edge, Cluster
from diagrams.onprem.network import Envoy
from diagrams.onprem.container import Containerd
from diagrams.k8s.compute import Pod
from diagrams.k8s.others import CRD

graph_attr = {"fontsize": "15", "pad": "0.5", "bgcolor": "transparent"}

with Diagram(
    show=False, filename="../../img/sidecar_less", graph_attr=graph_attr,
):
    integration = Server("Target")
    idp = Vault("IdP")
    with Cluster("Kubernetes-based Internal Platform"):
        controller = CM("Custom\nController")
        with Cluster("Pod boundary"):
            Pod("Istio-enabled")
            envoyfilter = CRD("EnvoyFilter")
            envoy = Envoy("Envoy")
            primary = Containerd("Primary")
            token = GenericSamlToken("")

            envoyfilter - Edge(label="configure\n\n\n\n\n", style="dashed") >> envoy
            envoy >> Edge(label="1. refresh token (out-of-band)") >> idp
            primary >> Edge(label="2. RPC") >> envoy >> Edge(
                label="2a. automatically add token"
            ) >> token >> integration
        controller - Edge(label="inject requested filter", style="dashed") - envoyfilter
