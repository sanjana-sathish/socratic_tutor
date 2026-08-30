r"""
Normalizes LaTeX delimiters to what Streamlit's markdown/KaTeX renderer
actually supports: $...$ for inline, $$...$$ for block.
"""

import re


def normalize_latex(text: str) -> str:
    text = re.sub(r"\\\[(.*?)\\\]", r"$$\1$$", text, flags=re.DOTALL)
    text = re.sub(r"\\\((.*?)\\\)", r"$\1$", text, flags=re.DOTALL)
    text = re.sub(r"\\boxed\{(.*?)\}", r"\1", text, flags=re.DOTALL)
    return text