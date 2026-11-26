import 'reflect-metadata';
import {Controller,Get,Module} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import type {NestExpressApplication} from '@nestjs/platform-express';
import {CloudPlannerController} from './cloud-planner';
@Controller()
class HealthController {
 @Get('health') health(){return {status:'ok',service:'browser-assistant'};}
}
@Module({controllers:[HealthController,CloudPlannerController]})
class AppModule {}
async function bootstrap(){
 const app=await NestFactory.create<NestExpressApplication>(AppModule,{bodyParser:false});
 app.useBodyParser('json',{limit:'12kb'});
 const origin=process.env.PLANNER_EXTENSION_ORIGIN;
 if(origin){
  if(!/^chrome-extension:\/\/[a-p]{32}$/.test(origin))throw new Error('PLANNER_EXTENSION_ORIGIN must be the precise Chrome extension origin');
  app.enableCors({origin,methods:['POST','OPTIONS'],allowedHeaders:['authorization','content-type']});
 }
 const port=Number(process.env.PORT??3000);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535');
 app.enableShutdownHooks();
 await app.listen(port,process.env.HOST??'127.0.0.1');
}
void bootstrap().catch(error=>{console.error(error);process.exitCode=1});
