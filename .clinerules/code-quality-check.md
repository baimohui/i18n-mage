## Code Quality Check Rules After Modification

### Rule 1: Must run check command after modifying code

**Applicable scenarios**: Any code file modifications (including .js, .ts, .jsx, .tsx, etc.)

**Requirements**:

- After completing code modifications, **must** run the `npm run check` command
- Check the output results for **no error-level errors**
- If there are errors, they must be fixed and the check rerun until passing without errors
- Warning-level issues can be ignored

### Rule 2: Must run unit tests after adding tests

**Applicable scenarios**: New or modified unit test files (typically located in `tests/unit/` directory)

**Requirements**:

- After writing unit test code, **must** run the `npm run test:unit` command
- Ensure all test cases **pass successfully** (green)
- If any tests fail, they must be fixed and rerun until all pass
- New test cases should cover main logic branches

### Execution Timing

- Before completing the task, first run `npm run check` to confirm no errors
- If unit tests are involved, run `npm run test:unit` after checks pass
- The task is considered complete only when both checks pass
