export const runtime="nodejs";
export async function POST(req:Request){
 const key=process.env.GEMINI_API_KEY;
 if(!key)return Response.json({error:"AI is not configured yet. Add GEMINI_API_KEY to your Vercel Environment Variables or .env.local."},{status:503});
 try{
  const {topic}=await req.json();if(typeof topic!=="string"||!topic.trim())return Response.json({error:"Enter a presentation topic."},{status:400});
  const prompt=`Create a student-friendly presentation outline about: ${topic}. Return ONLY valid JSON array with 6 to 8 objects. Each object must have title and body strings. Body should have 3-5 short bullet lines separated by newline. No markdown fences.`;
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key="+encodeURIComponent(key),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.5,maxOutputTokens:3000}})});
  const data=await response.json();if(!response.ok)throw new Error(data.error?.message||"Gemini request failed");
  const raw=data.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"";
  const parsed=JSON.parse(raw.replace(/^```(?:json)?|\`\`\`$/g,"").trim());
  if(!Array.isArray(parsed)||!parsed.length)throw new Error("AI returned an invalid slide outline.");
  return Response.json({slides:parsed.slice(0,12).map((x:any)=>({title:String(x.title||"Slide"),body:String(x.body||""),kind:"content"}))});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"AI draft failed."},{status:500})}
}