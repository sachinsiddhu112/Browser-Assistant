import {describe,expect,it} from 'vitest';
import {addChatNote,beginChatTurn,freshChat,modelContext,pendingQuestion,taskKey,chatKey,chatSources} from './working-chat';
import {resolveIntent,resumesPending} from './command-intent';
describe('temporary browser chat',()=>{
 it('retains a pending clarification across an unrelated request, then resolves it exactly once',()=>{
  const task=beginChatTurn(freshChat(),'Compare framework validation');
  const paused=addChatNote(task.chat,task.turn.id,{kind:'question',result:'Which framework?'});
  const other=beginChatTurn(paused,'Scroll down');
  const finished=addChatNote(other.chat,other.turn.id,{kind:'result',result:'Page scrolled'});
  expect(pendingQuestion(finished)).toMatchObject({id:task.turn.id,request:'Compare framework validation'});
  const next=beginChatTurn(finished,'NestJS');
  const scope=JSON.parse(modelContext(next.past,'NestJS'));
  expect(scope.pending.answer).toBe('NestJS');
  expect(scope.recent.at(-1).output).toBe('Page scrolled');
  const resumed=addChatNote(next.chat,next.turn.id,{kind:'result',result:'Found the NestJS documentation'},task.turn.id);
  expect(pendingQuestion(resumed)).toBeUndefined();
  expect(resumesPending({intent:'guided',resume:true})).toBe(true);
  expect(resumesPending({intent:'scroll_down'})).toBe(false);
 });
 it('keeps bounded sanitized context and does not let a stale callback repopulate a reset chat',()=>{
  const first=beginChatTurn(freshChat(),'Can you fill "Email" with "person@example.org"');
  let chat=first.chat;
  for(let i=0;i<12;i++)chat=beginChatTurn(chat,'request '+i+' '+('x '.repeat(360))).chat;
  expect(chat.turns).toHaveLength(8);
  expect(modelContext(chat).length).toBeLessThanOrEqual(2400);
  expect(modelContext(first.chat)).not.toContain('person@example.org');
  const cleared=freshChat();
  expect(addChatNote(cleared,first.turn.id,{kind:'result',result:'late response'})).toBe(cleared);
  expect(chatKey(1)).not.toBe(chatKey(2));
  expect(taskKey(1)).not.toBe(chatKey(1));
 });
 it('keeps verified source addresses local and validates the chosen index',()=>{
  const first=beginChatTurn(freshChat(),'Compare the docs');
  const chat=addChatNote(first.chat,first.turn.id,{kind:'result',result:'Done',sources:[{title:'NestJS',url:'https://docs.nestjs.com/pipes'}]});
  expect(chatSources(chat)).toHaveLength(1);
  expect(modelContext(chat)).toContain('NestJS');
  expect(modelContext(chat)).not.toContain('https:');
  expect(resolveIntent({intent:'context_source',target:0},'Open the source',[],[{url:'https://docs.nestjs.com/pipes',origin:'https://docs.nestjs.com',goal:''}]))
   .toMatchObject({type:'site',site:{url:'https://docs.nestjs.com/pipes'}});
  expect(()=>resolveIntent({intent:'context_source',target:1},'Open the source',[],[])).toThrow();
 });
});
