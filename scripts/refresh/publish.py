#!/usr/bin/env python3
"""
Publish the rebuilt data, but only if it actually changed, and only with a fresh cache stamp.

THE CACHE STAMP IS NOT COSMETIC. Every asset on this site is referenced with a ?v= build
stamp. Before that existed, index.html carried a hardcoded stamp and every deploy for months
was invisible to anyone who had already visited — the files changed on the server and returning
browsers kept serving what they had. Rebuilding the data daily and forgetting to bump the stamp
would recreate exactly that: a site that looks maintained and shows last month's crop.

Run by the daily refresh workflow after run.py reports every dataset current.
"""
import os
import re
import subprocess
import sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def git(*args, check=True):
    p = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if check and p.returncode != 0:
        print(p.stderr.strip(), file=sys.stderr)
        sys.exit(p.returncode)
    return p.stdout.strip()


def main():
    changed = git("status", "--porcelain", "assets/data")
    if not changed:
        print("no change in the data today — nothing to publish")
        return 0
    print("changed:\n" + changed)

    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    index = os.path.join(ROOT, "index.html")
    html = open(index).read()
    html = re.sub(r'(src="assets/[A-Za-z0-9_-]+\.js)(\?v=[^"]*)?"',
                  lambda m: m.group(1) + '?v=' + stamp + '"', html)
    html = re.sub(r'(href="assets/[A-Za-z0-9_-]+\.css)(\?v=[^"]*)?"',
                  lambda m: m.group(1) + '?v=' + stamp + '"', html)
    open(index, "w").write(html)
    print("cache stamp bumped to " + stamp)

    git("config", "user.name", "github-actions[bot]")
    git("config", "user.email", "github-actions[bot]@users.noreply.github.com")
    git("add", "assets/data", "index.html")
    git("commit", "-m", "Daily refresh " + datetime.utcnow().strftime("%Y-%m-%d") +
        "\n\nRebuilt from source. Every source keyless. The run fails rather than publishing "
        "if any source stops answering or a dataset falls behind its tolerance.")
    git("push", "origin", "HEAD:gh-pages")
    print("published")
    return 0


if __name__ == "__main__":
    sys.exit(main())
