package example.fixture;

import example.lifecycle.server.configuration.DatabaseInfrastructureConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.incrementer.IdentifierGenerator;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.yss.cloud.mybatis.YssMybatisMapperProperties;
import com.yss.cloud.mybatis.config.BatchSqlInjector;
import javax.sql.DataSource;
import org.h2.jdbcx.JdbcDataSource;
import org.apache.ibatis.session.SqlSessionFactory;
import org.mybatis.spring.mapper.MapperFactoryBean;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.MapPropertySource;
import java.util.HashMap;

/** 使用生成生产配置和平台工厂，仅把外部数据源替换为本机 H2；不补载测试 XML。 */
public class RuntimeProbe {
  @com.baomidou.mybatisplus.annotation.TableName("probe_record")
  public static class Record {
    @com.baomidou.mybatisplus.annotation.TableId(type=com.baomidou.mybatisplus.annotation.IdType.ASSIGN_ID)
    public Long id;
  }
  public interface RecordMapper extends com.baomidou.mybatisplus.core.mapper.BaseMapper<Record> {}
  public interface NextMapper { int query(); }
  public interface ExistingMapper { int query(); }
  public interface MissingMapper { int absent(); }
  @Configuration
  public static class Fixture {
    @Bean public DataSource dataSource() {
      JdbcDataSource ds = new JdbcDataSource(); ds.setURL("jdbc:h2:mem:lifecycle;MODE=MySQL;DB_CLOSE_DELAY=-1");
      try(java.sql.Connection c=ds.getConnection();java.sql.Statement s=c.createStatement()) {
        s.execute("create table probe_record(id bigint primary key)");
        s.execute("create table leaf_alloc(biz_tag varchar(128) primary key,max_id bigint,step int,description varchar(256),update_time timestamp)");
        s.execute("insert into leaf_alloc values('probe_record',1000,100,'fixture',CURRENT_TIMESTAMP)");
      }catch(java.sql.SQLException e){throw new IllegalStateException(e);}
      return ds;
    }
    @Bean public YssMybatisMapperProperties properties() {
      YssMybatisMapperProperties p = new YssMybatisMapperProperties();
      p.setMapperScan("example.fixture.unused"); p.setDbType("h2"); return p;
    }
    @Bean public BatchSqlInjector batchSqlInjector() { return new BatchSqlInjector(); }
    @Bean public MapperFactoryBean<RecordMapper> recordMapper(SqlSessionFactory factory) {
      MapperFactoryBean<RecordMapper> mapper = new MapperFactoryBean<>(RecordMapper.class);
      mapper.setSqlSessionFactory(factory); return mapper;
    }
    @Bean public MapperFactoryBean<NextMapper> nextMapper(SqlSessionFactory factory) {
      MapperFactoryBean<NextMapper> mapper = new MapperFactoryBean<>(NextMapper.class);
      mapper.setSqlSessionFactory(factory); return mapper;
    }
    @Bean public MapperFactoryBean<ExistingMapper> existingMapper(SqlSessionFactory factory) {
      MapperFactoryBean<ExistingMapper> mapper = new MapperFactoryBean<>(ExistingMapper.class);
      mapper.setSqlSessionFactory(factory); return mapper;
    }
  }
  @Configuration
  public static class MissingFixture {
    @Bean public MapperFactoryBean<MissingMapper> missingMapper(SqlSessionFactory factory) {
      MapperFactoryBean<MissingMapper> mapper = new MapperFactoryBean<>(MissingMapper.class);
      mapper.setSqlSessionFactory(factory); return mapper;
    }
  }
  public static void main(String[] args) {
    AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
    HashMap<String,Object> properties = new HashMap<>();
    boolean missing=args.length>0&&args[0].equals("missing");
    boolean segment=args.length>0&&args[0].equals("segment");
    properties.put("spring.leaf.leafSegmentEnable", segment);
    properties.put("spring.leaf.leafSnowflakeEnable", false);
    properties.put("spring.leaf.segment.database-type", "mysql");
    context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test-local",properties));
    context.register(DatabaseInfrastructureConfiguration.class,Fixture.class);
    if(missing)context.register(MissingFixture.class);
    try {
      context.refresh();
      if(missing)throw new AssertionError("缺失 statement 未在启动失败");
      if(context.getBean(NextMapper.class).query()!=42)throw new AssertionError("新增 XML 查询未生效");
      if(context.getBean(ExistingMapper.class).query()!=7)throw new AssertionError("已有 XML 查询未生效");
      SqlSessionFactory factory=context.getBean(SqlSessionFactory.class);
      ((org.springframework.beans.factory.config.BeanPostProcessor)context.getBean("projectMapperRegistration"))
          .postProcessAfterInitialization(factory,"repeat");
      if(context.getBean(NextMapper.class).query()!=42)throw new AssertionError("重复加载失败");
      if(context.getBeansOfType(GlobalConfig.class).size()!=1)throw new AssertionError("GlobalConfig 不唯一");
      if(GlobalConfigUtils.getGlobalConfig(factory.getConfiguration()).getIdentifierGenerator()
          !=context.getBean(IdentifierGenerator.class))throw new AssertionError("生产平台 ID 生成器未绑定");
      Record record=new Record();
      if(context.getBean(RecordMapper.class).insert(record)!=1||record.id==null
          ||context.getBean(RecordMapper.class).selectById(record.id)==null)throw new AssertionError("真实插入失败");
      if(segment&&(record.id<1000||record.id>=1100))throw new AssertionError("未消费 H2 号段");
      System.out.println("PASSED: actual insert through production generator, segment="+segment);
      System.out.println("PASSED: production factory, new/existing XML query, duplicate resource, platform generator identity");
    } catch (RuntimeException failure) {
      if(!missing)throw failure;
      Throwable cause=failure; String messages="";
      while(cause!=null) { messages+=cause.getMessage(); cause=cause.getCause(); }
      if(!messages.contains("MissingMapper.absent")||!messages.contains("resources="))throw failure;
      System.out.println("PASSED: missing statement fails during context startup with mapper/method/resources");
    } finally {context.close();}
  }
}
