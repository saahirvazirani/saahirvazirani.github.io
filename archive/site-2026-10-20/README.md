# Site Before the Blue-and-Black Redesign

Snapshot of the site at commit ed6866e, preserved before the October 20 redesign.
The index.html snapshot was verified identical to the working site before edits.

To restore, copy index.html, blogs.html, styles.css and BLOG_TEMPLATE.md to the
repository root, and copy the two files in blogs/ to the root blogs/ directory.
Commit those restored files and push main. If Pages is configured for GitHub
Actions after the redesign, either update the workflow to deploy the restored
files or change Settings > Pages > Build and deployment > Source to "Deploy
from a branch", selecting main and / (root). The new site.js and assets may
remain unused, or be removed in the same restore commit.

This snapshot includes the original blog and Substack adapter without changes.
Alternatively, revert the redesign release commit and deploy the resulting commit;
if that removes the Actions workflow, restore the branch publishing setting above.
