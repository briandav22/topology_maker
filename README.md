# topology_maker

Tools for planning and presenting Infoblox / Kentik deployments.

## kentik-configurator/

A local Python web app that serves the Infoblox deployment explorer and exports what you design as a standalone HTML page, a customer deployment guide PDF (with the explorer diagrams) or a setup JSON, Infoblox branded.

```sh
cd kentik-configurator
pip install -r requirements.txt
python3 run.py                      # web UI
python3 run.py export examples/hybrid-two-dc.json   # CLI export
```

See [kentik-configurator/README.md](kentik-configurator/README.md) for details. Example setups are in `examples/` and sample PDFs in `samples/`.

## explorer/

Self-contained HTML pages; open them directly in a browser.

- `infoblox-kentik-deployment-explorer.html` is the current Infoblox-branded version. It drops Kubernetes / Kentik Kube and shows the Universal Agent on Linux or Docker only. Use the steppers to show up to six data centers and ten branch offices. Branches have no Universal Agent by default and send their data across the WAN to a data center agent; any branch can be given its own. Each agent has the Kentik portal's capability switches, and the diagrams follow what is turned on. Export saves the current design as an HTML file.
- `kentik-deployment-explorer.html` is the original version, which still includes Kubernetes.
- `source-infoblox/` holds the pieces the Infoblox page is built from. Run `sh explorer/source-infoblox/build.sh` to rebuild it; this also updates the copy the Python app serves.
