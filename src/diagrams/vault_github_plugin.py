#!/usr/bin/env python3

from diagrams.aws.general import GenericSamlToken
from diagrams import Diagram, Edge, Cluster
from diagrams.onprem.security import Vault
from diagrams.onprem.vcs import Github
from diagrams.onprem.client import User

graph_attr = {"fontsize": "15", "pad": "0.5", "bgcolor": "transparent"}

with Diagram(
    show=False, filename="../../img/vault_github_plugin", graph_attr=graph_attr,
):
    user = User("Authenticated User")
    with Cluster("https://vault.acme.corp"):
        vault_plugin = [Vault("GitHub Plugin")]
        key = GenericSamlToken("GitHub App\nPrivate Key")
    with Cluster("https://api.github.com"):
        app = Github("GitHub App")

    user << Edge(
        color="black",
        style="bold",
        label="""
        1. GET /github/token
        X-Vault-Token: <Vault token>""",
    ) << vault_plugin << Edge(
        color="black",
        style="bold",
        label="""

        4. <GitHub Access Token>""",
    ) << user

    vault_plugin >> Edge(
        color="black",
        style="bold",
        label="""





        3. GET /apps/installations/<acme_corp_id>/access_tokens
        Authorization: Bearer <GitHub App JWT>""",
    ) >> app

    vault_plugin >> Edge(
        color="black", style="dotted", label="2. Mint GitHub App JWT"
    ) << key
