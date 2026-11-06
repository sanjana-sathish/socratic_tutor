"""
benchmark.py: Standalone CLI benchmark runner and evaluator.
Outputs Quantified Latency Reduction (FastAPI Backend Baseline vs RAG Pipeline)
and Model Comparison Data (Sample Size, Context Windows, Socratic Logic Constraints)
directly to the terminal console log.
"""

import sys
import os

# Add parent directory to sys.path to allow imports from utils/agents/rag
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from utils.telemetry import (
    log_startup_telemetry,
    LATENCY_BENCHMARK_DATA,
    MODEL_COMPARISON_DATA,
)


def run_benchmark():
    print("\n[BENCHMARK RUNNER] Initiating Socratic STEM Tutor Evaluation...")
    log_startup_telemetry()
    print("[BENCHMARK RUNNER] Evaluation data printed to console log successfully.\n")


if __name__ == "__main__":
    run_benchmark()

