# Non-impact rule records

A `non_impact_rule_ref` is never free text. It must resolve to a YAML record in this directory that binds one requirement, the verified SHA, the current candidate SHA, and the exact changed file paths being exempted. The validator recomputes the Git diff and rejects missing, extra, wildcard, or mismatched paths.
