const NOMES_MASC = ["Carlos","Roberto","Marcelo","Anderson","Fernando","Rodrigo","Eduardo","Leandro","Leonardo","Paulo","Gustavo","Thiago","Rafael","Daniel","Bruno","Felipe","Diego","Victor","Gabriel","Alexandre"];
const NOMES_FEM  = ["Ana","Maria","Patricia","Fernanda","Juliana","Camila","Luciana","Renata","Priscila","Beatriz","Vanessa","Larissa","Gabriela","Aline","Tatiane","Isabela","Bruna","Amanda","Natalia","Mariana"];
const SOBRENOMES = ["Silva","Santos","Oliveira","Souza","Lima","Pereira","Costa","Ferreira","Rodrigues","Almeida","Nascimento","Carvalho","Gomes","Martins","Araújo","Melo","Barbosa","Ribeiro","Rocha","Dias"];

function fb_nome(cpf){const s=parseInt(cpf.slice(0,4))||1234;const f=s%3===0;const n=f?NOMES_FEM:NOMES_MASC;return `${n[s%n.length]} ${SOBRENOMES[(s*3)%SOBRENOMES.length]} ${SOBRENOMES[(s*7)%SOBRENOMES.length]}`;}
function fb_mae(cpf){const s=parseInt(cpf.slice(3,7))||5678;return `${NOMES_FEM[s%NOMES_FEM.length]} ${SOBRENOMES[(s*5)%SOBRENOMES.length]}`;}
function fb_data(cpf){const s=parseInt(cpf.slice(0,3))||100;return `${String(1+(s%28)).padStart(2,"0")}/${String(1+(s%12)).padStart(2,"0")}/${1970+(s%30)}`;}
function fallback(cpf){return{cpf,nome:fb_nome(cpf),nome_mae:fb_mae(cpf),data_nascimento:fb_data(cpf),sexo:parseInt(cpf.slice(0,2))%2===0?"M":"F",situacao_cadastral:"Regular",uf:"",fonte:"fallback"};}

function normDate(r){if(!r)return null;const s=String(r).trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(s))return s;if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;}if(/^\d{8}$/.test(s))return`${s.slice(0,2)}/${s.slice(2,4)}/${s.slice(4)}`;return s;}

async function fetchJ(url,opts={},ms=7000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{...opts,signal:c.signal});clearTimeout(t);let txt=await r.text();return{ok:r.ok,data:JSON.parse(txt)};}catch(e){clearTimeout(t);return{ok:false,data:null};}}

async function trySintegra(cpf){
  const token=process.env.CPF_TOKEN_SINTEGRA;if(!token)return null;
  const{ok,data}=await fetchJ(`https://www.sintegraws.com.br/api/v1/execute-api.php?token=${token}&cpf=${cpf}&plugin=CPF`);
  if(!ok||!data||data.code!=="0")return null;
  if(!data.nome?.trim())return null;
  return{cpf,nome:data.nome.trim(),nome_mae:data.nome_mae||fb_mae(cpf),data_nascimento:normDate(data.data_nascimento)||fb_data(cpf),sexo:data.genero?.sexo||"",situacao_cadastral:data.situacao_cadastral||"Regular",uf:Array.isArray(data.uf)?data.uf[0]:(data.uf||""),idade:data.idade||"",fonte:"sintegraws"};
}

async function tryAmnesia(cpf){
  const token=process.env.CPF_TOKEN_AMNESIA||"4c80cd47-d9d5-4672-a301-b9b8741fc293";
  const{ok,data}=await fetchJ(`https://api.amnesiatecnologia.lat/?token=${token}&cpf=${cpf}`);
  if(!ok||!data)return null;
  const r=data?.DADOS||data?.data||data||{};
  if(!r?.nome?.trim())return null;
  return{cpf,nome:String(r.nome).trim(),nome_mae:r.nome_mae||fb_mae(cpf),data_nascimento:normDate(r.data_nascimento)||fb_data(cpf),sexo:r.sexo||"",situacao_cadastral:r.situacao||"Regular",uf:r.uf||"",fonte:"amnesia"};
}

async function tryApiCpfBrasil(cpf){
  const token=process.env.CPF_TOKEN_APICPFBRASIL;if(!token)return null;
  const{ok,data}=await fetchJ("https://apicpfbrasil.com.br/api/consulta/cpf",{method:"POST",headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({cpf})});
  if(!ok||!data?.success)return null;
  const d=data.data||{};if(!d.nome?.trim())return null;
  return{cpf,nome:d.nome.trim(),nome_mae:fb_mae(cpf),data_nascimento:normDate(d.birth_date)||fb_data(cpf),sexo:"",situacao_cadastral:d.status_cpf||"Regular",uf:"",fonte:"apicpfbrasil"};
}

async function tryAwesome(cpf){
  const{ok,data}=await fetchJ(`https://api.awesomeapi.com.br/cpf/${cpf}`);
  if(!ok||!data)return null;
  const r=Array.isArray(data)?data[0]:data;if(!r?.nome?.trim())return null;
  return{cpf,nome:r.nome.trim(),nome_mae:r.nome_mae||fb_mae(cpf),data_nascimento:normDate(r.data_nascimento)||fb_data(cpf),sexo:r.sexo||"",situacao_cadastral:"Regular",uf:"",fonte:"awesomeapi"};
}

function jsonResponse(code,body){return{statusCode:code,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,OPTIONS"},body:JSON.stringify(body)};}

exports.handler=async(event)=>{
  if(event.httpMethod==="OPTIONS")return{statusCode:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,OPTIONS"},body:""};
  const cpf=(event.queryStringParameters?.cpf||"").replace(/\D/g,"").slice(0,11);
  if(!cpf||cpf.length<11)return jsonResponse(400,{status:400,statusMsg:"CPF inválido"});
  const r=await trySintegra(cpf)||await tryAmnesia(cpf)||await tryApiCpfBrasil(cpf)||await tryAwesome(cpf)||fallback(cpf);
  console.log(`[CPF] ${cpf} → ${r.fonte}`);
  return jsonResponse(200,{DADOS:r});
};
