import 'reflect-metadata';
import {Controller,Get,Module} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
@Controller()
class HealthController {
 @Get('health') health(){return {status:'ok',service:'browser-assistant'};}
}
@Module({controllers:[HealthController]})
class AppModule {}
async function bootstrap(){
 const app=await NestFactory.create(AppModule);
 const port=Number(process.env.PORT??3000);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535');
 app.enableShutdownHooks();
 await app.listen(port,process.env.HOST??'127.0.0.1');
}
void bootstrap().catch(error=>{console.error(error);process.exitCode=1});
