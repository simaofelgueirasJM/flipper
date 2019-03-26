---
id: testing
title: Testing
sidebar_label: Testing
---

Developer tools are only used if they work. We have built APIs to test plugins.

## Android

Start by creating your first test file in this directory `MyFlipperPluginTest.java`. In the test method body we create our plugin which we want to test as well as a `FlipperConnectionMock`. In this contrived example we simply assert that our plugin's connected status is what we expect.

```java
@RunWith(RobolectricTestRunner.class)
public class MyFlipperPluginTest {

  @Test
  public void myTest() {
    final MyFlipperPlugin plugin = new MyFlipperPlugin();
    final FlipperConnectionMock connection = new FlipperConnectionMock();

    plugin.onConnect(connection);
    assertThat(plugin.connected(), equalTo(true));
  }
}
```

There are two mock classes that are used to construct tests `FlipperConnectionMock` and `FlipperResponderMock`. Together these can be used to write very powerful tests to verify the end to end behavior of your plugin. For example we can test if for a given incoming message our plugin responds as we expect.

```java
@Test
public void myTest() {
  final MyFlipperPlugin plugin = new MyFlipperPlugin();
  final FlipperConnectionMock connection = new FlipperConnectionMock();
  final FlipperResponderMock responder = new FlipperResponderMock();

  plugin.onConnect(connection);

  final FlipperObject params = new FlipperObject.Builder()
      .put("phrase", "flipper")
      .build();
  connection.receivers.get("myMethod").onReceive(params, responder);

  assertThat(responder.successes, hasItem(
      new FlipperObject.Builder()
          .put("phrase", "ranos")
          .build()));
}
```

## C++

Start by creating your first test file in this directory `MyFlipperPluginTests.cpp` and import the testing utilities from `xplat//sonar/xplat:FlipperTestLib`. These utilities mock out core pieces of the communication channel so that you can test your plugin in isolation.

```
#include <MyFlipperPlugin/MyFlipperPlugin.h>
#include <FlipperTestLib/FlipperConnectionMock.h>
#include <FlipperTestLib/FlipperResponderMock.h>

#include <folly/json.h>
#include <gtest/gtest.h>

namespace facebook {
namespace flipper {
namespace test {

TEST(MyFlipperPluginTests, testDummy) {
  EXPECT_EQ(1 + 1, 2);
}

} // namespace test
} // namespace flipper
} // namespace facebook
```

Here is a simple test using these mock utilities to create a plugin, send some data, and assert that the result is as expected.

```
TEST(MyFlipperPluginTests, testDummy) {
  std::vector<folly::dynamic> successfulResponses;
  auto responder = std::make_unique<FlipperResponderMock>(&successfulResponses);
  auto conn = std::make_shared<FlipperConnectionMock>();

  MyFlipperPlugin plugin;
  plugin.didConnect(conn);

  folly::dynamic message = folly::dynamic::object("param1", "hello");
  folly::dynamic expectedResponse = folly::dynamic::object("response", "Hi there");

  auto receiver = conn->receivers_["someMethod"];
  receiver(message, std::move(responder));

  EXPECT_EQ(successfulResponses.size(), 1);
  EXPECT_EQ(successfulResponses.back(), expectedResponse);
}
```
