# topology_maker

Tools for planning and presenting Infoblox / Kentik deployments.

## kentik-configurator/

A local Python web app for picking a Kentik deployment (data centers, Universal Agent hosts, AWS / Azure / GCP / OCI clouds) and exporting a topology PDF or a full customer deployment guide PDF, Infoblox branded.

```sh
cd kentik-configurator
pip install -r requirements.txt
python3 run.py                      # web UI
python3 run.py export examples/hybrid-two-dc.json   # CLI export
```

See [kentik-configurator/README.md](kentik-configurator/README.md) for details. Example setups are in `examples/` and sample PDFs in `samples/`.

## explorer/

Self-contained HTML pages; open them directly in a browser.

- `infoblox-kentik-deployment-explorer.html` is the current Infoblox-branded version. It drops Kubernetes / Kentik Kube and shows the Universal Agent on Linux or Docker only. Use the + and − next to Data center to show up to six data centers, each with its own Universal Agent, and open "All data centers" to see them side by side.
- `kentik-deployment-explorer.html` is the original version, which still includes Kubernetes.
- `source-infoblox/` holds the pieces the Infoblox page is built from. Run `sh explorer/source-infoblox/build.sh` to rebuild it.
