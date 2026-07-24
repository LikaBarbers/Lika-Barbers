
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const fs = require("fs");
const cors = require("cors");

const app = express();

app.use(cors());


if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}


const upload = multer({
  dest: "uploads/"
});


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


app.post("/hair-ai",
upload.single("photo"),
async (req,res)=>{

try{


const result = await openai.images.edit({

model:"gpt-image-1",

image:
await toFile(
fs.createReadStream(req.file.path),
"hair.png",
{
type:"image/png"
}
),

prompt:
`
Virtual barber haircut preview.

Keep the same person and face.
Change only the hairstyle.

New haircut:
${req.body.style}

Professional realistic barber result.
`,

size:"1024x1024"

});


res.json({

image:
"data:image/png;base64,"+
result.data[0].b64_json

});


}

catch(error){

console.log(error);

res.status(500).json({
error:error.message
});

}

});


app.listen(
process.env.PORT || 3000,
()=> console.log("AI Barber server ready")
);
