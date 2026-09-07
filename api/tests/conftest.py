"""Unit tests run without a server: NEO4J_URI is emptied (every store call then raises GraphUnavailable and the code
takes its in-memory paths) unless NEO4J_TEST_URI names a scratch Neo4j for the end-to-end suite - which wipes it.
Set before app.config reads the environment; the password defaults to the one docker-compose gives neo4j-test."""

import os

os.environ["NEO4J_URI"] = os.environ.get("NEO4J_TEST_URI", "")
os.environ.setdefault("NEO4J_PASSWORD", "contracts-graph")
