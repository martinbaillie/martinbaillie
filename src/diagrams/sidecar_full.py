#!/usr/bin/env python3

from diagrams.onprem.security import Vault
from diagrams.onprem.compute import Server
from diagrams.aws.general import GenericSamlToken
from diagrams.k8s.controlplane import CM
from diagrams import Diagram, Edge, Cluster
from diagrams.onprem.network import Envoy
from diagrams.onprem.container import Containerd
from diagrams.k8s.compute import Pod

graph_attr = {"fontsize": "15", "pad": "0.5", "bgcolor": "transparent"}

with Diagram(
    show=False, filename="../../img/sidecar_full", graph_attr=graph_attr,
):
    integration = Server("Target")
    idp = Vault("IdP")
    with Cluster("Kubernetes-based Internal Platform"):
        controller = CM("Custom\nController")
        with Cluster("Pod boundary"):
            Pod("Istio-enabled")
            envoy = Envoy("Envoy")
            sidecar = Containerd("Sidecar")
            primary = Containerd("Primary")
            token = GenericSamlToken("")

            sidecar >> Edge(label="1. refresh token (out-of-band)") >> envoy >> idp
            sidecar - Edge(label="2. provide token", style="dashed") - token - Edge(
                style="dashed"
            ) - primary
            primary >> Edge(label="3. RPC with token") >> envoy >> integration
        controller - Edge(label="inject requested sidecar", style="dashed") - sidecar
