import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { businesses, members, stores, items } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
export async function GET(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to use your shared workspace.'},{status:401});
 const db=getDb(),email=user.email.toLowerCase(),member=await db.select().from(members).where(eq(members.email,email)).get();
 if(!member)return Response.json({user,onboarding:true});
 return Response.json({user,member,business:await db.select().from(businesses).where(eq(businesses.id,member.business)).get(),stores:await db.select().from(stores).where(eq(stores.business,member.business)),items:await db.select().from(items).where(eq(items.business,member.business)),members:await db.select().from(members).where(eq(members.business,member.business))});
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Please sign in.'},{status:401});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{
 const raw=await request.json(); if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('Invalid request.'); const body=raw as Record<string,string>,db=getDb(),email=user.email.toLowerCase();
 const clean=(x:unknown,max=120)=>{if(typeof x!=='string'||!x.trim()||x.length>max)throw new Error('Please enter valid details.');return x.trim()};
 const member=await db.select().from(members).where(eq(members.email,email)).get();
 if(body.action==='setup'){
 if(member)throw new Error('You already belong to a workspace.');
 const id=crypto.randomUUID();await db.batch([db.insert(businesses).values({id,name:clean(body.business),owner:email}),db.insert(members).values({email,business:id,name:user.fullName||email.split('@')[0],role:'owner'}),db.insert(stores).values({id:crypto.randomUUID(),business:id,name:clean(body.store),location:body.location?clean(body.location):''})]);return Response.json({ok:true});
 }
 if(!member)return Response.json({error:'Workspace membership required.'},{status:403});
 if(body.action==='addStore'||body.action==='invite'){
 if(member.role!=='owner')return Response.json({error:'Only the owner can manage stores and people.'},{status:403});
 if(body.action==='addStore')await db.insert(stores).values({id:crypto.randomUUID(),business:member.business,name:clean(body.name),location:body.location?clean(body.location):''});
 else {const target=clean(body.email).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))throw new Error('Enter a valid email address.');if(!['partner','employee'].includes(body.role))throw new Error('Select a valid role.');await db.insert(members).values({email:target,business:member.business,name:clean(body.name),role:body.role});}
 }else if(body.action==='addItem'){
 const store=await db.select().from(stores).where(and(eq(stores.id,body.store),eq(stores.business,member.business))).get();if(!store)throw new Error('Select a store.');
 const quantity=Number(body.quantity);if(!Number.isInteger(quantity)||quantity<1||quantity>100000)throw new Error('Quantity must be between 1 and 100,000.');
 await db.insert(items).values({id:crypto.randomUUID(),business:member.business,store:store.id,name:clean(body.name),quantity,unit:clean(body.unit),category:clean(body.category),priority:body.priority==='urgent'?'urgent':'normal',note:body.note?clean(body.note,1000):'',status:'needed',addedBy:member.name,boughtBy:null,created:new Date().toISOString(),boughtAt:null});
 }else if(body.action==='buy'||body.action==='reopen'){
 if(member.role==='employee')return Response.json({error:'A partner or owner must mark purchases.'},{status:403});
 const buying=body.action==='buy',result=await db.update(items).set({status:buying?'bought':'needed',boughtBy:buying?member.name:null,boughtAt:buying?new Date().toISOString():null}).where(and(eq(items.id,body.id),eq(items.business,member.business),eq(items.status,buying?'needed':'bought'))).returning();if(!result.length)throw new Error('This item was already updated. Refresh the list.');
 }else throw new Error('Unknown action.');
 return Response.json({ok:true});
 }catch(error){return Response.json({error:error instanceof Error&&!error.message.includes('SQL')?error.message:'Could not save. This email may already belong to a workspace.'},{status:400})}
}
