const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());


const storage = multer.diskStorage({

destination:function(req,file,cb){

cb(null,"uploads/");

},

filename:function(req,file,cb){

cb(
null,
Date.now()+".png"
);

}

});


const upload = multer({

storage:storage

});



const openai = new OpenAI({

apiKey:
process.env.OPENAI_API_KEY

});





app.post(
"/hair-ai",

upload.single("photo"),

async(req,res)=>{


try{


const imagePath =
req.file.path;



const result =
await openai.images.edit({

model:"gpt-image-1",

image:
fs.createReadStream(
imagePath
),


prompt:
`
Virtual barber try on.

Keep the same face and identity.

Only change the hairstyle.

New hairstyle:
${req.body.style}

Realistic professional haircut.
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


}

);






app.listen(

process.env.PORT || 3000,

()=>{

console.log(
"Lika Barber AI ready"
);

}

);
