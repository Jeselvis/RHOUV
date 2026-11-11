#!/usr/bin/env python3
"""
Uncanny Valley Institute for Housewife Analytics
-------------------------------------------------
Computes ridiculous-but-real statistical findings across all recorded episodes.

Usage:
    .venv/bin/python3.12 analysis/ridiculous_stats.py [--runs N]

Outputs JSON to stdout. Paste into Claude with:
"Generate the UVIHA LinkedIn report from this data."
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

from api.analytics import RUNS_DIR, load_run_events, compute_summary, CAST_FIRST_NAMES


# ── Findings ──────────────────────────────────────────────────────────────────

def _chaos_externality(all_runs):
    """Who causes the most collateral damage relative to directed attacks?"""
    directed: dict[str, int] = defaultdict(int)
    area: dict[str, int] = defaultdict(int)
    exits: dict[str, int] = defaultdict(int)

    for _, events, summary in all_runs:
        for name, stats in summary.get("drama_stats", {}).items():
            directed[name] += stats.get("targeted", 0)
            area[name]     += stats.get("area", 0)
            exits[name]    += stats.get("exit", 0)

    result = {}
    for name in set(list(directed) + list(area)):
        total_directed = directed[name]
        total_area     = area[name]
        result[name] = {
            "directed_attacks":   total_directed,
            "area_attacks":       total_area,
            "exits":              exits[name],
            "collateral_ratio":   round(total_area / max(total_directed, 1), 2),
        }
    return result


def _breakdown_brand_paradox(all_runs):
    """Do personalities who lose composure end up with more or less brand?"""
    records = []
    for _, events, summary in all_runs:
        fb    = summary.get("first_breakdown", {})
        final = summary.get("final_brand", {})
        for name, score in final.items():
            records.append({
                "name":        name,
                "broke_down":  fb.get(name) is not None,
                "final_brand": score,
            })

    broke = [r["final_brand"] for r in records if r["broke_down"]]
    held  = [r["final_brand"] for r in records if not r["broke_down"]]

    return {
        "broke_down_avg":      round(sum(broke) / len(broke), 1) if broke else 0,
        "held_together_avg":   round(sum(held)  / len(held),  1) if held  else 0,
        "n_broke":             len(broke),
        "n_held":              len(held),
        "raw":                 records,
    }


def _mention_asymmetry(all_runs):
    """Who obsesses over whom? Directional mention counts."""
    matrix: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for _, events, _ in all_runs:
        for e in events:
            if e.get("type") != "table_talk":
                continue
            speaker      = e.get("speaker", "")
            content      = e.get("content", "")
            speaker_first = speaker.split()[0] if speaker else ""
            for fname, fullname in CAST_FIRST_NAMES.items():
                if fname != speaker_first and fname in content:
                    matrix[speaker][fullname] += 1

    pairs = []
    seen  = set()
    for a, targets in matrix.items():
        for b, a_to_b in targets.items():
            key = tuple(sorted([a, b]))
            if key in seen:
                continue
            seen.add(key)
            b_to_a = matrix[b].get(a, 0)
            total  = a_to_b + b_to_a
            if total == 0:
                continue
            pairs.append({
                "a":      a,
                "b":      b,
                "a_to_b": a_to_b,
                "b_to_a": b_to_a,
                "delta":  abs(a_to_b - b_to_a),
                "ratio":  round(a_to_b / max(b_to_a, 1), 2),
            })

    pairs.sort(key=lambda x: x["delta"], reverse=True)
    return pairs[:6]


def _first_blood(all_runs):
    """Does the first personality to escalate win the episode?"""
    records = []
    for fname, events, summary in all_runs:
        dramas = [e for e in events if e.get("type") == "drama_action"]
        final  = summary.get("final_brand", {})
        if not dramas or not final:
            continue
        aggressor = dramas[0].get("speaker")
        if not aggressor:
            continue
        winner = max(final.items(), key=lambda x: x[1])[0]
        records.append({
            "run":            fname,
            "first_aggressor": aggressor,
            "winner":          winner,
            "won":             aggressor == winner,
            "aggressor_brand": final.get(aggressor),
            "winner_brand":    final.get(winner),
        })

    win_rate = sum(1 for r in records if r["won"]) / len(records) if records else 0
    return {
        "win_rate":   round(win_rate * 100, 1),
        "n_episodes": len(records),
        "detail":     records,
    }


def _talk_vs_brand(all_runs):
    """Does talking more correlate with better brand?"""
    records = []
    for _, events, summary in all_runs:
        tc = summary.get("talk_counts", {})
        fb = summary.get("final_brand", {})
        for name in set(tc) & set(fb):
            records.append({"name": name, "talks": tc[name], "brand": fb[name]})
    return records


def _breakdown_speed(all_runs):
    """How many dinner statements until each personality first breaks down?"""
    timings: dict[str, list[int]] = defaultdict(list)

    for _, events, summary in all_runs:
        fb = summary.get("first_breakdown", {})
        for name, idx in fb.items():
            if idx is None:
                continue
            talk_before = sum(1 for e in events[:idx] if e.get("type") == "table_talk")
            timings[name].append(talk_before)

    return {
        name: {
            "avg_statements_to_breakdown": round(sum(v) / len(v), 1),
            "n_episodes_broke":            len(v),
        }
        for name, v in timings.items()
    }


def _wine_sensitivity(all_runs):
    """Average composure lost per wine tick, per personality."""
    drops: dict[str, list[float]] = defaultdict(list)

    for _, events, _ in all_runs:
        for e in events:
            if e.get("type") == "composure_delta" and "wine" in (e.get("reason") or "").lower():
                name  = e.get("speaker")
                delta = e.get("delta", 0)
                if name and delta:
                    drops[name].append(abs(delta))

    return {
        name: {
            "avg_drop_per_tick": round(sum(v) / len(v), 2),
            "total_wine_ticks":  len(v),
        }
        for name, v in drops.items()
    }


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="UVIHA ridiculous stats dump")
    parser.add_argument("--runs", type=int, default=None,
                        help="Max number of most-recent runs to analyze (default: all)")
    args = parser.parse_args()

    run_files = sorted(RUNS_DIR.glob("*.jsonl"), key=lambda f: f.stat().st_mtime, reverse=True)
    if args.runs:
        run_files = run_files[:args.runs]

    all_runs = []
    for path in run_files:
        events = load_run_events(path.name)
        if not events:
            continue
        if not any(e.get("type") == "run_meta" for e in events):
            continue  # skip incomplete runs
        summary = compute_summary(events)
        all_runs.append((path.name, events, summary))

    if not all_runs:
        print(json.dumps({"error": "No complete runs found in runs/"}), file=sys.stderr)
        sys.exit(1)

    output = {
        "meta": {
            "n_episodes":  len(all_runs),
            "run_files":   [f for f, _, _ in all_runs],
            "cast":        list(CAST_FIRST_NAMES.values()),
        },
        "chaos_externality":      _chaos_externality(all_runs),
        "breakdown_brand_paradox": _breakdown_brand_paradox(all_runs),
        "mention_asymmetry":       _mention_asymmetry(all_runs),
        "first_blood":             _first_blood(all_runs),
        "talk_vs_brand":           _talk_vs_brand(all_runs),
        "breakdown_speed":         _breakdown_speed(all_runs),
        "wine_sensitivity":        _wine_sensitivity(all_runs),
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
