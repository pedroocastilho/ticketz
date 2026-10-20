import QueueOption from "../../models/QueueOption";

interface QueueOptionData {
  queueId: number;
  title: string;
  option: string;
  message?: string;
  parentId?: number;
  exitChatbot?: boolean;
  forwardQueueId?: number;
  closeTicket?: boolean;
}

const CreateService = async (
  queueOptionData: QueueOptionData
): Promise<QueueOption> => {
  const queueOption = await QueueOption.create(queueOptionData);
  return queueOption;
};

export default CreateService;
