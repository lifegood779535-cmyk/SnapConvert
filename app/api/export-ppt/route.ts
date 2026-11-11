import PptxGenJS from "pptxgenjs";
export const runtime="nodejs";
export async function POST(req:Request){
 try{
  const body=await req.json();const slides=Array.isArray(body.slides)?body.slides:[];
  if(!slides.length||slides.length>60) return Response.json({error:"Add between 1 and 60 slides."},{status:400});
  const ppt=new PptxGenJS();ppt.layout="LAYOUT_WIDE";ppt.author="SnapConvert";ppt.subject="Presentation created in SnapConvert";ppt.title="SnapConvert Presentation";
  const theme=String(body.theme||"Clean").toLowerCase();
  const bg=theme==="midnight"?"172640":theme==="ocean"?"EAF5FB":theme==="warm"?"FFF3E8":"FFFFFF";
  const fg=theme==="midnight"?"FFFFFF":"203451";
  for(const item of slides){const s=ppt.addSlide();s.background={color:bg};s.addText(String(item.title||"Untitled slide"),{x:.7,y:.7,w:11.8,h:1.1,fontFace:"Aptos Display",fontSize:30,bold:true,color:fg,margin:0,breakLine:false});const lines=String(item.body||"").split("\n").filter(Boolean);s.addText(lines.map(x=>({text:x,options:{bullet:{indent:18},breakLine:true}})),{x:.9,y:2.2,w:11.2,h:4.2,fontFace:"Aptos",fontSize:19,color:fg,breakLine:false,paraSpaceAfterPt:12,margin:.05});s.addText("SNAPCONVERT",{x:10.5,y:7.05,w:2,h:.25,fontSize:8,color:theme==="midnight"?"AAB7CA":"8995A6",align:"right"});}
  const data=await ppt.write({outputType:"nodebuffer"}) as Buffer;
  return new Response(new Uint8Array(data),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.presentationml.presentation","Content-Disposition":"attachment; filename=snapconvert-presentation.pptx"}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:"Could not create PPTX."},{status:500})}
}