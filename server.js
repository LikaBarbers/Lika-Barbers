
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const fs = require("fs");
const cors = require("cors");

const app = express();

app.use(cors());

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


const result =
await openai.images.edit({

model:"gpt-image-1",

image:
fs.createReadStream(req.file.path),

prompt:
`
This is a barber virtual try on.

Keep exactly the same face.
Do not change identity.

Change only hairstyle to:
${req.body.style}

Make realistic haircut.
`,

size:"1024x1024"

});



const imageBase64 =
result.data[0].b64_json;



res.json({

image:
`data:image/png;base64,${imageBase64}`

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
()=>{

console.log(
"Lika Barber AI running"
);

});
