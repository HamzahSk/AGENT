ROCCKY BOT — Full Codebase Audit, Bug Fixing & Documentation

ROLE

Act as a Senior Backend Engineer, Node.js Performance Engineer, and WhatsApp Bot Specialist.

Your responsibility is to thoroughly audit, debug, optimize, repair, and document the existing ROCCKY WhatsApp Bot project.

You must work directly with the existing codebase. Do not simply provide suggestions or theoretical solutions. Perform actual code analysis and implement necessary improvements.

Your primary objectives are:

1. Eliminate existing bugs and runtime errors.
2. Fix unexpected bot restarts and crashes.
3. Improve WhatsApp connection stability.
4. Fix unreliable interactive buttons and message responses.
5. Improve Cloud Database connectivity and reliability.
6. Optimize performance for low-spec servers.
7. Create comprehensive technical documentation.

---

PHASE 1 — PROJECT DISCOVERY

First, locate and open the project directory:

"roccky_bot"

Before modifying anything, thoroughly understand the existing project.

Required actions:

1. Inspect the complete project structure.
2. Read "DOCS_BAILEYS.md" from beginning to end.
3. Read "package.json" and identify all dependencies.
4. Inspect the main entry point and initialization process.
5. Analyze the plugin and event handler systems.
6. Inspect the database integration and configuration.
7. Identify how WhatsApp authentication and sessions work.
8. Examine message handling, interactive buttons, and command execution.
9. Identify background tasks, scheduled jobs, and persistent processes.
10. Inspect existing error handling and logging mechanisms.

Do not assume the architecture based on filenames alone. Read the actual implementation.

Important:

- Respect the existing architecture whenever possible.
- Identify dependencies between modules before changing them.
- Avoid unnecessary rewrites.
- Do not remove existing features simply because they are difficult to maintain.
- Preserve existing user data, authentication sessions, and configurations.

---

PHASE 2 — FULL SYSTEM AUDIT

Perform a comprehensive audit of the entire bot.

Pay special attention to the following areas.

2.1 Runtime Stability

Investigate why the bot sometimes restarts or crashes while actively being used.

Look for:

- Unhandled promise rejections.
- Uncaught exceptions.
- Memory leaks.
- Excessive memory allocation.
- Event listener accumulation.
- Infinite loops.
- Uncontrolled background processes.
- Improper resource cleanup.
- Race conditions.
- Recursive event execution.
- Incorrect asynchronous operations.
- Unhandled errors inside plugins.
- Processes that remain active after their tasks finish.

Determine the actual causes instead of applying superficial fixes.

Implement appropriate error handling, resource management, and recovery mechanisms.

2.2 WhatsApp Connection Stability

Investigate the Baileys integration.

Check:

- Connection lifecycle management.
- Connection update handlers.
- Reconnection logic.
- Authentication state handling.
- Session persistence.
- Socket initialization.
- Duplicate socket instances.
- Message event listeners.
- Connection timeout handling.
- Network interruption recovery.
- Logout and reconnect behavior.

Ensure that:

- Only the intended active socket is maintained.
- Reconnection attempts do not create duplicate listeners.
- Temporary network failures do not unnecessarily destroy sessions.
- Connection recovery does not trigger an uncontrolled restart loop.
- Authentication data is handled safely.

Use "DOCS_BAILEYS.md" as the primary reference for Baileys implementation.

Do not use outdated Baileys APIs when the documentation specifies a newer implementation.

2.3 Interactive Buttons & Message Handling

Investigate why buttons sometimes fail to appear or respond.

Audit:

- Interactive message generation.
- Button payload structure.
- Message serialization.
- Message sending functions.
- Context information.
- Message type compatibility.
- Button callback handling.
- Command routing.
- Response handling.
- Error handling during message delivery.

Ensure interactive messages follow the correct Baileys implementation.

Avoid unnecessary changes to message formats that could break existing features.

Where a message type is unsupported or unreliable, implement an appropriate fallback.

2.4 Cloud Database Reliability

Investigate all database-related issues.

Check:

- Database connection initialization.
- Connection pooling.
- Connection timeout.
- Network interruption handling.
- Reconnection behavior.
- Query execution.
- Concurrent database operations.
- Duplicate writes.
- Database disconnection.
- Data consistency.
- Improper connection cleanup.

Implement:

- Reliable connection management.
- Controlled retry mechanisms.
- Connection health checks where appropriate.
- Proper error handling.
- Safe database initialization.
- Efficient query execution.
- Graceful degradation when the database is temporarily unavailable.

Avoid retry storms and infinite retry loops.

Do not silently ignore database errors.

If the existing architecture supports a local JSON fallback, evaluate and improve it without introducing unnecessary complexity.

2.5 Plugin & Event System

Inspect every plugin and event handler.

Look for:

- Duplicate event registrations.
- Broken imports.
- Circular dependencies.
- Inconsistent plugin interfaces.
- Missing error boundaries.
- Unnecessary module loading.
- Blocking operations.
- Memory-intensive operations.
- Improper command registration.
- Conflicts between plugins.

Ensure plugins operate independently where possible.

A failure in one non-critical plugin should not crash the entire bot.

---

PHASE 3 — IMPLEMENTATION & REPAIR

After completing the audit, implement the necessary fixes.

Prioritize problems based on their impact:

1. Critical crashes and unexpected restarts.
2. WhatsApp connection instability.
3. Database connectivity problems.
4. Interactive buttons and message delivery.
5. Plugin and event handling bugs.
6. Memory and CPU inefficiencies.
7. General code quality improvements.

Engineering requirements

- Write maintainable and modular code.
- Prefer native Node.js APIs when appropriate.
- Avoid unnecessary dependencies.
- Avoid excessive abstraction.
- Use asynchronous operations correctly.
- Prevent unhandled promise rejections.
- Avoid blocking the event loop.
- Implement proper resource cleanup.
- Use consistent error handling.
- Keep existing functionality compatible.
- Avoid introducing breaking changes.

Do not replace entire modules unless there is a clear technical reason.

Whenever possible, make targeted modifications.

---

PHASE 4 — LOW-END SERVER OPTIMIZATION

ROCCKY must remain lightweight and reliable on low-quality servers.

This is a critical requirement.

Optimize the bot for environments with limited CPU, RAM, and network performance.

Performance requirements

1. Minimize unnecessary memory allocations.
2. Avoid loading unused modules.
3. Prevent duplicate event listeners.
4. Avoid unnecessary database queries.
5. Optimize repeated operations.
6. Prevent excessive logging.
7. Avoid unnecessary background workers.
8. Use streaming for large data when appropriate.
9. Clean up temporary files and resources.
10. Avoid unnecessary dependencies.
11. Prevent memory leaks in long-running processes.
12. Avoid CPU-intensive operations on the main event loop.

Resource management

Inspect expensive operations such as:

- Image processing.
- Video processing.
- File downloads.
- HTTP requests.
- Database operations.
- Large message processing.
- Plugin initialization.

Use reasonable timeouts, concurrency limits, and resource cleanup.

Do not introduce Redis, message queues, additional databases, or other infrastructure unless genuinely necessary.

Important principle

Prioritize:

Stability > Reliability > Resource Efficiency > Additional Features

Do not sacrifice stability for unnecessary performance tricks.

---

PHASE 5 — TESTING & VERIFICATION

After implementing the fixes, perform a thorough verification process.

Required checks

- Validate package imports.
- Check syntax errors.
- Check module compatibility.
- Check event registration.
- Check database initialization.
- Check error handling.
- Check reconnection logic.
- Check message handling.
- Check interactive message generation.
- Check plugin loading.
- Check resource cleanup.

Run the available project tests and create additional tests where appropriate.

If the project does not have a testing framework, consider implementing lightweight tests without introducing excessive dependencies.

Runtime verification

Where possible, simulate:

- Temporary database disconnections.
- Network interruptions.
- Reconnection attempts.
- Failed message delivery.
- Plugin execution errors.
- Concurrent message processing.

Verify that these situations do not unnecessarily crash the entire bot.

Do not claim that a feature has been tested if it has not actually been tested.

If real WhatsApp or cloud database credentials are unavailable, clearly document which tests require a live environment.

---

PHASE 6 — CREATE COMPLETE DOCUMENTATION

Create a new directory:

"docs/"

This directory must contain comprehensive technical documentation for the entire ROCCKY bot.

The documentation should help future developers and AI agents understand, maintain, debug, and extend the project without repeatedly analyzing the entire codebase.

Documentation must describe the actual implementation, not an assumed architecture.

Required documentation structure

Create the following files, adjusting the structure when necessary:

docs/README.md

Main documentation index.

Include:

- Project overview.
- Main capabilities.
- Technology stack.
- Documentation navigation.
- Quick links to important documents.

docs/ARCHITECTURE.md

Explain the complete bot architecture.

Include:

- Application architecture.
- Main execution flow.
- Initialization lifecycle.
- Module relationships.
- Plugin architecture.
- Event-driven architecture.
- WhatsApp connection lifecycle.
- Database integration.

Include Mermaid diagrams where useful.

docs/STRUCTURE.md

Complete project directory structure.

Explain:

- Main directories.
- Important files.
- Responsibilities of each module.
- Entry points.
- Configuration files.
- Plugin locations.
- Utility modules.
- Database-related files.

Avoid listing irrelevant dependencies or generated files.

docs/INSTALLATION.md

Installation and setup guide.

Include:

- Requirements.
- Node.js and runtime requirements.
- Dependency installation.
- Environment configuration.
- Authentication setup.
- Database configuration.
- Starting the bot.
- Production deployment.

docs/CONFIGURATION.md

Complete configuration reference.

Document:

- Environment variables.
- Configuration files.
- Default values.
- Required and optional settings.
- Database settings.
- WhatsApp settings.
- Plugin settings.
- Runtime settings.

Never expose real API keys, passwords, tokens, or session credentials.

docs/FEATURES.md

Complete feature documentation.

For every existing feature, explain:

- Feature name.
- Description.
- How it works.
- Relevant files.
- Dependencies.
- Commands or usage.
- Configuration requirements.
- Known limitations.

docs/PLUGINS.md

Plugin development guide.

Explain:

- How plugins are discovered.
- How plugins are loaded.
- Plugin structure.
- Plugin interfaces.
- Event handling.
- Command registration.
- Utility usage.
- Error handling.
- How to create a new plugin.
- How to safely modify existing plugins.

Provide practical code examples based on the actual project architecture.

docs/EVENTS.md

Document the event system.

Include:

- Available events.
- Event registration.
- Message lifecycle.
- Connection events.
- Event handlers.
- Execution order.
- Error handling.

docs/DATABASE.md

Complete database documentation.

Include:

- Database architecture.
- Connection initialization.
- Connection lifecycle.
- Data models or collections.
- Query operations.
- Data persistence.
- Retry mechanisms.
- Error handling.
- Fallback mechanisms.
- Database troubleshooting.

docs/BAILEYS.md

Document the Baileys integration.

Include:

- Baileys version.
- Socket initialization.
- Authentication state.
- Connection lifecycle.
- Message processing.
- Interactive messages.
- Reconnection behavior.
- Relevant APIs.
- Important implementation notes.

Use "DOCS_BAILEYS.md" as the primary technical reference.

docs/ERROR_HANDLING.md

Explain the bot's error management system.

Include:

- Error categories.
- Logging.
- Exception handling.
- Promise rejection handling.
- Recovery mechanisms.
- Database failures.
- Connection failures.
- Plugin failures.
- Debugging procedures.

docs/PERFORMANCE.md

Explain performance optimization.

Include:

- Memory management.
- CPU optimization.
- Event loop considerations.
- Concurrency management.
- Database efficiency.
- Resource cleanup.
- Recommendations for low-end servers.

docs/DEVELOPMENT.md

Guide for developers and AI coding agents.

Include:

- Development workflow.
- Coding conventions.
- Project architecture rules.
- How to add features.
- How to modify existing modules.
- Testing procedures.
- Debugging workflow.
- Compatibility requirements.
- Important files to inspect before making changes.

docs/TROUBLESHOOTING.md

Common problems and their solutions.

Include:

- Bot unexpectedly restarting.
- WhatsApp disconnection.
- Authentication problems.
- Buttons not appearing.
- Messages failing to send.
- Database connection failures.
- Plugin errors.
- High memory usage.
- High CPU usage.

docs/CHANGELOG.md

Record important modifications.

Include:

- Bug fixes.
- Performance improvements.
- Architecture changes.
- Updated dependencies.
- New features.
- Breaking changes, if any.

---

PHASE 7 — FINAL REVIEW

Before finishing:

1. Review all modified files.
2. Verify that existing features remain functional.
3. Check for accidental configuration changes.
4. Verify that no credentials were exposed.
5. Ensure all documentation matches the actual implementation.
6. Check that no unnecessary dependencies were added.
7. Ensure the project remains lightweight.
8. Verify that the bot can still start using its existing startup procedure.

Update existing documentation if it becomes outdated.

Do not delete "DOCS_BAILEYS.md". Keep it as the original Baileys reference unless there is a clear reason to update it.

---

IMPORTANT RULES

- Work directly inside "roccky_bot".
- Do not stop after analyzing the code.
- Actually implement the identified fixes.
- Do not ask for confirmation for every individual modification.
- Do not rewrite the entire project unnecessarily.
- Do not remove existing bot features.
- Do not delete authentication sessions or user data.
- Do not expose secrets in documentation or logs.
- Do not introduce unnecessary infrastructure.
- Do not make unsupported claims about successful tests.
- Prioritize compatibility with the existing runtime.
- Keep resource consumption as low as reasonably possible.

If you discover a problem that cannot be safely fixed because external credentials, infrastructure, or information are unavailable, document it clearly and explain what is required.

---

FINAL REPORT

After completing the work, provide a detailed but concise report containing:

1. Project Analysis
   
   - Original architecture.
   - Main problems discovered.

2. Bug Fixes
   
   - Problems fixed.
   - Root causes.
   - Files modified.

3. Stability Improvements
   
   - Crash prevention.
   - Connection recovery.
   - Database reliability.
   - Button and message handling.

4. Performance Improvements
   
   - Memory optimization.
   - CPU optimization.
   - Improvements for low-end servers.

5. Testing Results
   
   - Tests executed.
   - Passed tests.
   - Failed tests.
   - Tests requiring a live environment.

6. Documentation
   
   - All files created inside "docs/".
   - Brief explanation of each document.

7. Remaining Issues
   
   - Unresolved bugs.
   - External dependencies.
   - Recommended future improvements.

8. Final Status
   
   - Overall project condition.
   - Whether the bot is ready for deployment.
   - Any important deployment considerations.

Your goal is to transform ROCCKY from an unstable WhatsApp bot into a reliable, maintainable, well-documented, and lightweight application suitable for long-running operation on low-spec servers.