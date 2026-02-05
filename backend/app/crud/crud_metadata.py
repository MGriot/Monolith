from app.crud.base import CRUDBase
from app.models.metadata import Topic, WorkType
from app.schemas.metadata import TopicCreate, TopicUpdate, WorkTypeCreate, WorkTypeUpdate

class CRUDTopic(CRUDBase[Topic, TopicCreate, TopicUpdate]):
    pass

class CRUDWorkType(CRUDBase[WorkType, WorkTypeCreate, WorkTypeUpdate]):
    pass

topic = CRUDTopic(Topic)
work_type = CRUDWorkType(WorkType)
