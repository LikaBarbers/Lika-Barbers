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



// AI HAIR CHANGE

app.post("/hair-ai",
upload.single("photo"),
async (req, res) => {

try {

const style = req.body.style;


const result = await openai.images.edit({

model: "gpt-image-1",

image:
fs.createReadStream(
req.file.path
),

prompt:
`
Keep exactly the same person and face.

Change only the hairstyle.

New barber hairstyle:
${style}

Make it look like a real professional barber haircut.
High quality realistic photo.
`

});


res.json({

image:
result.data[0].url

});


}

catch(error){

console.log(error);

res.status(500).json({

error:"AI failed"

});

}

});




// START SERVER

app.listen(
process.env.PORT || 3000,
()=>{

console.log("Lika Barbers AI is running");

}

);
