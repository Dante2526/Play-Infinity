const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /if \(idMatch\) optionId = idMatch\[1\];/;

const newCodeForMovie = `
         const regexOptions = /player_select_item["'][^>]*data-id=["'](\\d+)["'][^>]*>[\\s\\S]*?<div[^>]*player_select_name[^>]*>([^<]+)<\\/div>/gi;
         let match;
         const options = [];
         while ((match = regexOptions.exec(html)) !== null) {
            options.push({ id: match[1], name: match[2].trim() });
         }
         if (options.length > 0) {
            const upnsOpt = options.find(o => o.name.includes("UPNS"));
            optionId = upnsOpt ? upnsOpt.id : options[0].id;
         }
`;

code = code.replace(regex, newCodeForMovie);

const regexSeries = /const dubOpt = optJson.data.options.find\(\(o:any\) => String\(o.target\) === "1" \|\| \/dub\/i.test\(o.type \|\| ""\)\);\s*optionId = String\(\(dubOpt \|\| optJson.data.options\[0\]\).ID\);/;

const newCodeForSeries = `
               const dubOptions = optJson.data.options.filter((o:any) => String(o.target) === "1" || /dub/i.test(o.type || ""));
               const availableOpts = dubOptions.length > 0 ? dubOptions : optJson.data.options;
               const upnsOpt = availableOpts.find((o:any) => (o.server || "").includes("UPNS") || (o.name || "").includes("UPNS"));
               optionId = String((upnsOpt || availableOpts[0]).ID);
`;

code = code.replace(regexSeries, newCodeForSeries);

fs.writeFileSync('server.ts', code);
console.log("Updated to prefer UPNS!");
