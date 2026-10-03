const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'server.ts');

let content = fs.readFileSync(file, 'utf8');

// Also remove nuvixRoutes import and app.use if it exists
content = content.replace(/import\s*\{\s*nuvixRouter\s*\}\s*from\s*['"]\.\/server\/routes\/nuvixRoutes['"];?/g, '');
content = content.replace(/app\.use\s*\(\s*nuvixRouter\s*\);?/g, '');

if (!content.includes('subtitlesRouter')) {
    content = content.replace(
        'export const app = express();',
        'import { subtitlesRouter } from "./server/routes/subtitlesRoutes";\nexport const app = express();\napp.use(subtitlesRouter);'
    );
    fs.writeFileSync(file, content, 'utf8');
    console.log("Added subtitlesRouter to server.ts");
} else {
    console.log("subtitlesRouter already added.");
}
