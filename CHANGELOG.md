# 1.3.4

### **New**
  - Added localization support for Shrimp game embeds
  - Added `CHANGELOG.md`
### **Changes**
  - Reduced the Twitch polling interval from 2 minutes to 1 minute
  - Removed unused logger imports
  - Changed various logger messages types

# 1.3.3

### **New**
  - Added owner-only dashboard console access protection via OWNER_ID
  - Added Docker deployment support with a dedicated Dockerfile and docker-compose configuration
  - Added dashboard console access protection for the owner account
  - Added public-origin URL handling for dashboard links
### **Changes**
  - Improved dashboard backend logic and environment handling
  - Updated README documentation and environment example files
  - Cleaned up configuration and link handling for the Discord Activity dashboard
### **Fixes**
  - Fixed the Pass the Shrimp Down cooldown message format
  - Fixed dashboard links and URL generation for the correct public host
  - Fixed documentation and configuration inconsistencies

# 1.3.2

### **Changes**
  - Improved static pages styling

# 1.3.1

### **New**
  - Added Shards monitoring to the homepage
  - Added static pages for Terms of Service, Legal Credits and Privacy Policy
### **Changes**
  - Static pages are accessible from the apex: `esraniki.space`, dashboard is now accessible from a new subdomain: `dash.esraniki.space`

# 1.3.0

### **New**
  - Added a new theme switcher with Catppuccin Latte, Frappé, Mocha and Discord Dark options
  - Added the Pass the Shrimp Down interactive game
  - Added ascending and descending sorting for Messages and Voice Time in the statistics leaderboard
  - Added per-guild timezone and hour-format settings
  - Added new button styles and improved existing button components
  - Added source-code and funding buttons to the home page
  - Added dropdown menu animations
  - Added a centralized error handler for clearer stack traces and error reporting
  - Added early Discord Activity dashboard support
  - Added icons to card header labels
### **Changes**
  - Major code reformatting, refactors, and performance-focused cleanup
  - Increased the default dashboard zoom for better accessibility
  - Replaced the old per-page dropdown templates with shared dropdown rendering
  - Made dropdown menus scrollable instead of overflowing the viewport
  - Improved the statistics leaderboard layout and readability
  - Redesigned the dashboard pages for a more cohesive and consistent experience
  - Disabled page scrolling on the Statistics and Minecraft pages
  - Split the dashboard stylesheet into dedicated files for maintainability
  - Removed the "Refreshing in..." text from the Minecraft page
  - Reworked CSS variables and unified related classes
  - Removed stale CSS variables and duplicate utility classes
  - Updated project dependencies to newer versions
  - Clarified and improved the example environment documentation
### **Fixes**
  - Fixed HTML entity encoding in Minecraft MOTD output
  - Fixed Minecraft tracking and Twitch monitoring responsiveness issues
  - Fixed the home administrators list failing to load guild admins correctly
  - Fixed dropdown menus not appearing correctly
  - Fixed button style variables and related regressions
  - Fixed various dashboard layout inconsistencies and UI bugs
  - Fixed console output polling and update reliability issues
  - Fixed the console width alignment with status cards on the home page
  - Fixed the sidebar footer anchoring issue at lower zoom levels
  - Fixed Lucide icon alignment and spacing problems
  - Fixed the Twitch page layout alignment
  - Fixed styling regressions in the dashboard home page and shared component layout

# 1.2.0

### **New**
  - Added a development environment script
### **Changes**
  - Updated the README and environment example documentation
  - Improved dashboard styling with Catppuccin color palette
  - Updated the project to Discord.js 14 and refreshed related integration code
  - Cleaned up formatting and project configuration files
### **Fixes**
  - Fixed Minecraft embed emoji rendering
  - Removed unused language keys
  - Fixed interaction crashes for timed-out replies

# 1.1.0

### **New**
  - Added a feature-complete dashboard web application for configuring the bot
  - Added Minecraft server monitoring with live status and player tracking
  - Added server statistics tracking for message and voice activity
  - Added Twitch live-announcement support
  - Added multi-language support with English and French locale files
### **Changes**
  - Refactored and fixed the timestamp formatting module in `style.js`
  - Updated language handling to use English as the base locale
  - Improved documentation, environment examples, and git ignore rules
  - Adjusted logger variables and debug checks
  - Improved IPv4 handling for dashboard-related hooks
  - Applied formatting and cleanup across the codebase
### **Fixes**
  - Fixed a bot crash when disconnecting from voice chat

# 1.0.0

- Initial release.