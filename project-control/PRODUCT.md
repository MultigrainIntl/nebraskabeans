# NebraskaBeans Product Contract

NebraskaBeans / GISit is a professional agricultural decision-support system. It should reduce interpretation burden so an agricultural professional can rapidly understand crop stage, current condition, recent change, regional differences, agronomic meaning, crop response, yield direction when defensible, production significance, what to watch next, and bounded commercial implications.

Core flow: MAP → WHAT CHANGED? → CROP STAGE → AGRONOMIC CONSEQUENCE → CROP RESPONSE → PRODUCTION SIGNIFICANCE → YIELD IMPLICATION → WHAT TO WATCH NEXT.

The opening experience must emphasize a concise current crop outlook and a map-dominant decision workspace. Do not force the user through a long analytical report before reaching the map.

Use progressive disclosure: Level 1 Answer; Level 2 Evidence; Level 3 Methodology. Technical GIS terms belong primarily in evidence and provenance, not the main workflow.

A professional user should be able to answer: What is happening? Where? Why? Is it changing? Does it matter? What should I watch? without interpreting raw GIS layers or trusting unexplained precise numbers.

The architecture should remain reusable across other bean classes, growing regions, pulse crops, and future GISit applications, without sacrificing correctness of the Nebraska product.
