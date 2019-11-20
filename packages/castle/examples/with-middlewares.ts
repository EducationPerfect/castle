import { createCastle, produce, eachMessage } from '@ovotech/castle';
import { StartEvent, StartEventSchema, CompleteEvent, CompleteEventSchema } from './avro';
import {
  createDb,
  createLogging,
  DbContext,
  LoggingContext,
  createErrorHandling,
} from './middlewares';

const start = produce<StartEvent>({ topic: 'my-start-3', schema: StartEventSchema });
const complete = produce<CompleteEvent>({ topic: 'my-complete-3', schema: CompleteEventSchema });

const eachStart = eachMessage<StartEvent, DbContext & LoggingContext>(
  async ({ message, db, logger, producer }) => {
    logger.log('Started', message.value.id);
    const { rows } = await db.query('SELECT avatar FROM users WHERE id = $1', [message.value.id]);
    logger.log('Found', rows, 'Sending Complete');
    complete(producer, [{ value: { id: message.value.id } }]);
  },
);

const eachComplete = eachMessage<CompleteEvent, LoggingContext>(async ({ message, logger }) => {
  logger.log('Complete recieved for', message.value.id);
});

const main = async () => {
  const db = createDb({
    user: 'boost-statements-api',
    database: 'boost-statements-api',
    password: 'dev-pass',
    host: '127.0.0.1',
  });
  const logging = createLogging(console);
  const errorHandling = createErrorHandling();

  const castle = createCastle({
    schemaRegistry: { uri: 'http://localhost:8081' },
    kafka: { brokers: ['localhost:29092'] },
    consumers: [
      {
        topic: 'my-start-3',
        groupId: 'my-start-3',
        eachMessage: logging(errorHandling(db(eachStart))),
      },
      {
        topic: 'my-complete-3',
        groupId: 'my-complete-3',
        eachMessage: logging(errorHandling(eachComplete)),
      },
    ],
  });

  await castle.start();

  await start(castle.producer, [{ value: { id: 1 } }]);
};

main();
